import { LogIn, LogOut } from 'lucide-react';
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Sign-in button, or the signed-in user's menu. */
export function AccountMenu() {
  const { signOut } = useAuth();
  const { user } = useUser();
  return (
    <>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-10 gap-2 px-2.5 text-white/85 hover:bg-white/10">
              <span className="grid size-7 place-items-center rounded-full bg-[var(--lb-accent)] text-xs font-bold text-[var(--lb-on-accent)]">
                {user?.firstName?.charAt(0) || 'U'}
              </span>
              <span className="hidden xl:inline">{user?.firstName || 'User'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="border-b border-slate-700 px-3 py-2 text-sm">
              <div className="font-medium">{user?.fullName || 'User'}</div>
              <div className="text-xs text-slate-400">{user?.emailAddresses[0]?.emailAddress}</div>
            </div>
            <DropdownMenuItem onClick={() => signOut()} className="text-red-400 focus:text-red-300">
              <LogOut className="mr-2 size-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outline" size="sm" className="h-10 gap-2 border-white/25 bg-transparent px-3 text-white hover:bg-white/10">
            <LogIn className="size-4" />
            <span>Sign In</span>
          </Button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
