import scheduler from "node-schedule";
import { logger } from "../logger";

export interface Schedule {
  name: string;
  cron: string;
  job: () => void;
}

export const initializeScheduler = (schedules: Schedule[]) => {
  schedules.forEach((schedule) => {
    scheduler.scheduleJob(schedule.cron, (fireDate) => {
      const now = new Date();
      if (fireDate.setHours(0, 0, 0, 0) !== now.setHours(0, 0, 0, 0)) {
        logger.info(
          `${schedule.name} was supposed to run at ${fireDate}, but actually ran at ${now}`
        );
      }
      schedule.job();
    });
  });
};
