import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner, TaskStatus } from './taskRunner';

export async function taskWorker() {
    const taskRepository = AppDataSource.getRepository(Task);
    const taskRunner = new TaskRunner(taskRepository);

    while (true) {
        const executableTask = await findExecutableTask(taskRepository);

        if (executableTask) {
            try {
                await taskRunner.run(executableTask);
            } catch (error) {
                console.error('Task execution failed. Task status has already been updated by TaskRunner.');
                console.error(error);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

async function findExecutableTask(taskRepository: any): Promise<Task | undefined> {
    const taskWithOutDependency = await taskRepository.findOne({
        where: {
            status: TaskStatus.Queued,
            dependsOn: undefined
        },
        relations: ['workflow']
    });

    if (taskWithOutDependency) {
        return taskWithOutDependency;
    }

    const tasksWithDependency = await taskRepository.find({
        where: {
            status: TaskStatus.Queued
        },
        relations: ['workflow']
    });

    for (const task of tasksWithDependency) {
        if (task.dependsOn) {
            const dependencyTask = await taskRepository.findOne({
                where: { taskId: task.dependsOn }
            });

            if (dependencyTask && dependencyTask.status === TaskStatus.Completed) {
                return task;
            }
        }

        return undefined
    }



}