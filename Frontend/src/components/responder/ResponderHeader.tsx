"use client"

import { Bell, Moon, Check, User } from "lucide-react"
import { useResponderStore } from "@/lib/store"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function ResponderHeader() {
    const { isAvailable, toggleAvailability, notifications } = useResponderStore()

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white backdrop-blur px-6 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 font-bold text-xl text-blue-600">
                <span>MentalHealthEco</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Responder</span>
            </div>

            <div className="flex items-center gap-6">
                {/* Availability Toggle */}
                <div
                    className={`flex items-center gap-3 px-4 py-2 rounded-full transition-colors ${isAvailable ? "bg-green-50 text-green-800 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"
                        }`}
                >
                    <span className="text-sm font-semibold">{isAvailable ? "Available" : "Offline"}</span>
                    <Switch
                        checked={isAvailable}
                        onCheckedChange={toggleAvailability}
                        className={`${isAvailable ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-gray-300"}`}
                    />
                </div>

                <div className="flex items-center gap-4">
                    {/* Notifications Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="relative hover:bg-gray-100 hover:text-gray-900">
                                <Bell className="h-5 w-5 text-gray-600" />
                                {notifications > 0 && (
                                    <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white" />
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-80 p-0 bg-white border-gray-200 text-gray-900" align="end" forceMount>
                            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h4 className="font-semibold text-sm text-gray-900">Notifications</h4>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-gray-500 hover:text-blue-600 px-2">Mark all read</Button>
                            </div>
                            <ScrollArea className="h-[300px]">
                                <div className="divide-y divide-gray-100">
                                    {[1, 2].map((i) => (
                                        <div key={i} className="p-3 hover:bg-blue-50/50 cursor-pointer flex gap-3 transition-colors group">
                                            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-200 transition-colors">
                                                <Bell className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-800 font-medium">New match available</p>
                                                <p className="text-xs text-gray-500 mt-0.5">A high priority case matches your profile.</p>
                                                <span className="text-[10px] text-gray-400 mt-1 block">2 mins ago</span>
                                            </div>
                                            <div className="h-2 w-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Profile Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                                    <AvatarImage src="/avatars/01.png" alt="@shadcn" />
                                    <AvatarFallback>JD</AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 bg-white border-gray-200 text-gray-900" align="end" forceMount>
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none text-gray-900">John Doe</p>
                                    <p className="text-xs leading-none text-muted-foreground">
                                        john@example.com
                                    </p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                                Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    )
}
