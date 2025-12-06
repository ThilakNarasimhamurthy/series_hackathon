import Link from "next/link"

export function Footer() {
    return (
        <footer className="bg-black text-gray-500 py-12 px-6 border-t border-white/10 z-10 relative">
            <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="text-sm text-center md:text-left">
                    <p>© 2024 MentalHealthEco.</p>
                    <p className="text-xs mt-1 text-gray-600">Built for the Series Hackathon.</p>
                </div>

                <div className="flex gap-6 text-sm">
                    <Link href="/dashboard" className="hover:text-white transition-colors">Responder Login</Link>
                    <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
                    <span className="text-red-900 select-none">988</span>
                </div>
            </div>
        </footer>
    )
}
