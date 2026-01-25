import { useParams } from "react-router";

export default function EventDetail() {
  const { eventId } = useParams();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <p className="text-gray-500 dark:text-gray-400">
        Event {eventId} - Coming soon
      </p>
    </div>
  );
}
