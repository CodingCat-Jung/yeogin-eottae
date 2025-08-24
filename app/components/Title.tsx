import { Store, useStore } from "@tanstack/react-store";

export default function Title(props: { info: Store<{
    type: "h1" | "p";
    text: string;
    name: undefined | string;
}> }) {
    const data = useStore(props.info, (state) => {
        return (
            <section className="rounded-tl-lg rounded-br-lg bg-white w-full lg:w-64 p-4 border-slate-400 border-2 shrink-0">
                {state.name ? (
                    <p className="text-2xl mb-2">
                        <span className="text-base block">Hello,</span>
                        <span className="text-cyan-600 me-0.5">{state.name}</span>
                        !
                    </p>
                ):(
                    <p>
                        <span className="text-xl block">your travel planner -</span>
                        <span className="text-2xl flex align-bottom gap-0.5">
                            <span className="text-cyan-600 text-3xl">Travia</span>
                            <span className="leading-10.5"></span>
                        </span>
                    </p>
                )}
                {state.type === "h1" ? (
                    <h1 className="text-xl break-keep">{state.text}</h1>
                ): (
                    <p className="break-keep">{state.text}</p>
                )}
            </section>
        )
    });

    return data;
}