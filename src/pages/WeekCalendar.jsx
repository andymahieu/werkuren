import Planner from './Planner';

export { formatTime } from '../lib/time';

export default function WeekCalendar() {
    return <Planner mode="week" />;
}
