// components/PrefList.tsx
import { ReactNode } from "react";
import { Badge } from "./ui/badge";

export default function PrefList({
                                   icon,
                                   value,
                                   type,
                                   list,
                                 }: {
  readonly icon?: ReactNode;
  value?: string;
  type: string;
  list?: {
    readonly icon: ReactNode;
    value: string;
  }[] | string; // string이 올 수도 있어서 union 처리
}) {
  if (Array.isArray(list)) {
    return (
      <li className="flex flex-col gap-2">
        <span className="text-lg font-semibold text-gray-700 mb-1">{type}</span>
        <div className="flex flex-wrap gap-2">
          {list.map((item, idx) => (
            <Badge
              className="text-sm rounded-full bg-purple-100 text-purple-700 px-3 py-1 shadow hover:scale-105 transition"
              key={idx}
              variant="outline"
            >
              {item.icon}
              <span className="ml-1">{item.value}</span>
            </Badge>
          ))}
        </div>
      </li>
    );
  } else {
    return (
      <li className="flex flex-col gap-1">
        <span className="text-lg font-semibold text-gray-700 mb-1">{type}</span>
        <Badge
          className="text-sm rounded-full bg-purple-100 text-purple-700 px-3 py-1 shadow hover:scale-105 transition"
          variant="outline"
        >
          {icon}
          <span className="ml-1">{value}</span>
        </Badge>
      </li>
    );
  }
}
