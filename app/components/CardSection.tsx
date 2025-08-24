import { ReactNode } from "react";
import { Card } from "./ui/card";

export default function CardSection({ ref, children } : {
    ref?: React.RefObject<HTMLDivElement>;
    readonly children: ReactNode
}) {
    return (
        <Card ref={ref} className="rounded-lg bg-white border-slate-400 border-1 my-2 p-4 grow">
            {children}
        </Card>
    );
}
