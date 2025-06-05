import { Repository } from 'typeorm';
import { Task } from '../models/Task';
import { getJobForTaskType } from '../jobs/JobFactory';
import {WorkflowStatus} from "../workflows/WorkflowFactory";
import {Workflow} from "../models/Workflow";
import {Result} from "../models/Result";

export enum TaskStatus {
    Queued = 'queued',
    InProgress = 'in_progress',
    Completed = 'completed',
    Failed = 'failed'
}

export class TaskRunner {
    constructor(
        private taskRepository: Repository<Task>,
    ) {}

    /**
     * Runs the appropriate job based on the task's type, managing the task's status.
     * @param task - The task entity that determines which job to run.
     * @throws If the job fails, it rethrows the error.
     */
    async run(task: Task): Promise<void> {
        task.status = TaskStatus.InProgress;
        task.progress = 'starting job...';
        await this.taskRepository.save(task);

        let dependencyResult = null;

        if (task.dependsOn) {
            const resultRepository = this.taskRepository.manager.getRepository(Result);
            const dependencyTask = await this.taskRepository.findOne({where: { taskId: task.dependsOn}});

            if (dependencyTask?.resultId) {
                const result = await resultRepository.findOne({where: { resultId: dependencyTask.resultId}});

                dependencyResult = result && result.data ? JSON.parse(result.data) : null;
            }
        }

        const job = getJobForTaskType(task.taskType);

        try {
            console.log(`Starting job ${task.taskType} for task ${task.taskId}...`);
            const resultRepository = this.taskRepository.manager.getRepository(Result);
            const taskResult = await job.run(task, dependencyResult);
            console.log(`Job ${task.taskType} for task ${task.taskId} completed successfully.`);
            const result = new Result();
            result.taskId = task.taskId!;
            result.data = JSON.stringify(taskResult || {});
            await resultRepository.save(result);
            task.resultId = result.resultId!;
            task.status = TaskStatus.Completed;
            task.progress = null;
            await this.taskRepository.save(task);

        } catch (error: any) {
            console.error(`Error running job ${task.taskType} for task ${task.taskId}:`, error);

            task.status = TaskStatus.Failed;
            task.progress = null;
            await this.taskRepository.save(task);

            throw error;
        }

        const workflowRepository = this.taskRepository.manager.getRepository(Workflow);
        const currentWorkflow = await workflowRepository.findOne({ where: { workflowId: task.workflow.workflowId }, relations: ['tasks'] });

        if (currentWorkflow) {
            const allCompleted = currentWorkflow.tasks.every(t => t.status === TaskStatus.Completed);
            const anyFailed = currentWorkflow.tasks.some(t => t.status === TaskStatus.Failed);

            if (anyFailed) {
                currentWorkflow.status = WorkflowStatus.Failed;

                const failedTasks = currentWorkflow.tasks.filter(t => t.status === TaskStatus.Failed);
                currentWorkflow.finalResult = JSON.stringify({
                            status: 'failed',
                            failedTasks: failedTasks.map(t => ({
                                taskId: t.taskId,
                                taskType: t.taskType,
                                error: 'Task execution failed'
                            }))
                });                
            } else if (allCompleted) {
                currentWorkflow.status = WorkflowStatus.Completed;

                const resultRepository = this.taskRepository.manager.getRepository(Result);
                const aggregatedResults = {
                    workflowId: currentWorkflow.workflowId,
                    status: 'completed',
                    tasks: [] as {
                        taskId: string;
                        taskType: string;
                        stepNumber: number;
                        output: any;
                    }[]
                };

                for (const task of currentWorkflow.tasks) {
                    if (task.resultId) {
                        const result = await resultRepository.findOne({ 
                            where: { resultId: task.resultId } 
                        });
                        
                        aggregatedResults.tasks.push({
                            taskId: task.taskId,
                            taskType: task.taskType,
                            stepNumber: task.stepNumber,
                            output: result && result.data ? JSON.parse(result.data) : null
                        });
                    }
                }

                currentWorkflow.finalResult = JSON.stringify(aggregatedResults);                
            } else {
                currentWorkflow.status = WorkflowStatus.InProgress;
            }

            await workflowRepository.save(currentWorkflow);
        }
    }
}