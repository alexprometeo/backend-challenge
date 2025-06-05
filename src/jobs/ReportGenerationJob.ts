
import { Job } from "./Job";
import { Task } from "../models/Task";
import { Workflow } from "../models/Workflow";
import { Result } from "../models/Result";

export class ReportGenerationJob implements Job {
    async run(task: Task): Promise<any> {
        const workflow = await task.workflow

        const tasks: {
            taskId: string;
            type: string;
            output: string | { error: string } | undefined;
        }[] = [];

        for (const task of workflow.tasks) {
            tasks.push({
                taskId: task.taskId,
                type: task.taskType,
                output: task.status === "failed" ? {error: "Task failed"} : task.resultId
            })
        }

        const report = {
            workflowId: workflow.workflowId,
            tasks,
            finalReport: "Aggregated data & results"
        };

        return report
    }
}