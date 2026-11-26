import Link from "next/link";
import { Wordmark } from "./logo";
import { HeaderActions, HeaderContainer, NavLinks } from "./header-actions";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <HeaderContainer>
        <Link href="/" aria-label="EasyJobs home" className="rounded-lg">
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="ml-auto">
          <HeaderActions />
        </div>
      </HeaderContainer>
    </header>
  );
}
