import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { Task } from '../models/Task';
import { TaskStatus } from "../workers/taskRunner";

export enum WorkflowStatus {
    Initial = 'initial',
    InProgress = 'in_progress',
    Completed = 'completed',
    Failed = 'failed'
}

interface WorkflowStep {
    dependsOn: any;
    taskType: string;
    stepNumber: number;
}

interface WorkflowDefinition {
    name: string;
    steps: WorkflowStep[];
}

export class WorkflowFactory {
    constructor(private dataSource: DataSource) { }

    /**
     * Creates a workflow by reading a YAML file and constructing the Workflow and Task entities.
     * @param filePath - Path to the YAML file.
     * @param clientId - Client identifier for the workflow.
     * @param geoJson - The geoJson data string for tasks (customize as needed).
     * @returns A promise that resolves to the created Workflow.
     */
    async createWorkflowFromYAML(filePath: string, clientId: string, geoJson: string): Promise<Workflow> {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const workflowDef = yaml.load(fileContent) as WorkflowDefinition;
        const workflowRepository = this.dataSource.getRepository(Workflow);
        const taskRepository = this.dataSource.getRepository(Task);
        const workflow = new Workflow();

        workflow.clientId = clientId;
        workflow.status = WorkflowStatus.Initial;

        const savedWorkflow = await workflowRepository.save(workflow);

        const tasks: Task[] = [];
        const stepNumberToTask = new Map<number, Task>();

        for (const step of workflowDef.steps) {
            const task = new Task();
            task.clientId = clientId;
            task.geoJson = geoJson;
            task.status = TaskStatus.Queued;
            task.taskType = step.taskType;
            task.stepNumber = step.stepNumber;
            task.workflow = savedWorkflow;

            stepNumberToTask.set(step.stepNumber, task);

            tasks.push(task);
        }

        for(const step of workflowDef.steps) {
            if(step.dependsOn) {

                const task = tasks.find(t => t.stepNumber === step.stepNumber);
                const dependencyTask = stepNumberToTask.get(step.dependsOn);

                if (task && dependencyTask) {
                    (task as any)._dependsOnStep = step.dependsOn;
                }
            }
        }

        await taskRepository.save(tasks);

        for (const task of tasks) {
            if ((task as any)._dependsOnStep) {
                const dependencyTask = tasks.find(t => t.stepNumber === (task as any)._dependsOnStep)
                if (dependencyTask) task.dependsOn = dependencyTask.taskId
            }
        }

        // We save again to include the correct reference to the dependecy task
        await taskRepository.save(tasks);        

        return savedWorkflow;
    }
}