import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
} from "@/components/ui/navigation-menu"  
import { Link, ParsedLocation, redirect } from "@tanstack/react-router"
import { Store, useStore } from "@tanstack/react-store"
import { Button } from "./ui/button"
import { Session, titleInfo } from "@/routes/__root"

function resetSession(session: Store<Session>) {
    session.setState((state) => {
        return {
            ...state,
            user_id: undefined,
            nickname: undefined   
        }
    });

    titleInfo.setState((state) => {
        return {
            ...state,
            name: undefined
        }
    });

    throw redirect({ to: "/" });
}

export default function Header(props: { session: Store<Session>, uri: ParsedLocation }) {
    const data = useStore(props.session, (state) => {
        return (
        <NavigationMenu className="flex justify-between max-w-full p-4 bg-slate-50 shadow-md">
            <NavigationMenuList>
                <NavigationMenuItem>
                    <Link to="/" className="rounded-xl p-2 hover:bg-slate-100 text-xl text-cyan-600">
                        🌏 Travia
                    </Link>
                </NavigationMenuItem>
            </NavigationMenuList>
            <NavigationMenuList>
                <NavigationMenuItem>
                    {state.user_id ? (
                        <>
                        <Link to="/history" className="rounded-xl p-2 hover:bg-slate-100 text-xl text-cyan-600">
                            History
                        </Link>
                        <Button className="text-xl text-cyan-600" variant="ghost" onClick={(e) => resetSession(props.session)}>
                            Logout
                        </Button>
                        </>
                    ) : (
                        // searchParams 반영되도록 추후 수정
                        <Link to="/login" search={{ re_uri: `${props.uri.pathname}` }} className="rounded-xl p-2 hover:bg-slate-100 text-xl text-cyan-600">
                            Login
                        </Link>
                    )}
                </NavigationMenuItem>
            </NavigationMenuList>
        </NavigationMenu>
        )
    })

    return data;
}