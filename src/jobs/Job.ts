import {Task} from "../models/Task";


export interface Job {
    run(task: Task, dependencyResult?: any): Promise<any>;
}