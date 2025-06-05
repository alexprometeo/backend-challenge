import { Router, RequestHandler } from 'express';
import { AppDataSource } from '../data-source';
import { Workflow } from '../models/Workflow';
import { Task } from '../models/Task';

const router = Router();

const getWorkflowStatus: RequestHandler = async (req, res) => {
    try {
        const workflowRepository = AppDataSource.getRepository(Workflow);
        const workflow = await workflowRepository.findOne({ 
            where: { workflowId: req.params.id }, 
            relations: ['tasks'] 
        });

        if (!workflow) {
            res.status(404).json({ 
                message: "Workflow not found" 
            });
            return;
        }

        const totalTasks = workflow.tasks.length;
        const completedTasks = workflow.tasks.filter(task => 
            task.status === 'completed'
        ).length;

        res.json({
            workflowId: workflow.workflowId,
            status: workflow.status,
            completedTasks,
            totalTasks
        });

    } catch (error) {
        console.error('Error fetching workflow status:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
};

const getWorkflowResults: RequestHandler = async (req, res) => {
    try {
        const workflowRepository = AppDataSource.getRepository(Workflow);
        const workflow = await workflowRepository.findOne({ 
            where: { workflowId: req.params.id }
        });

        if (!workflow) {
            res.status(404).json({ 
                message: "Workflow not found" 
            });
            return;
        }

        if (workflow.status !== "completed") {
            res.status(400).json({ 
                message: "Workflow not completed yet" 
            });
            return;
        }

        res.json({
            workflowId: workflow.workflowId,
            status: workflow.status,
            finalResult: workflow.finalResult ? JSON.parse(workflow.finalResult) : null
        });

    } catch (error) {
        console.error('Error fetching workflow results:', error);
        res.status(500).json({ 
            message: 'Internal server error' 
        });
    }
};

router.get('/:id/status', getWorkflowStatus);
router.get('/:id/results', getWorkflowResults);

export default router;
