import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface QuickStartLink {
	title: string;
	description: string;
	to: string;
	icon?: string;
}

interface QuickStartLinksProps {
	links: QuickStartLink[];
}

export default function QuickStartLinks({
	links,
}: QuickStartLinksProps): ReactNode {
	return (
		<div className={styles.quickStartLinks}>
			{links.map((link, idx) => (
				<Link
					key={idx}
					to={link.to}
					className={styles.link}
				>
					{link.icon && (
						<div className={styles.icon}>{link.icon}</div>
					)}
					<div className={styles.content}>
						<h4 className={styles.title}>{link.title}</h4>
						<p className={styles.description}>
							{link.description}
						</p>
					</div>
					<div className={styles.arrow}>→</div>
				</Link>
			))}
		</div>
	);
}

