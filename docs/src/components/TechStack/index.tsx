import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

interface TechItem {
	name: string;
	description?: string;
	icon?: string;
}

interface TechStackProps {
	title: string;
	items: TechItem[];
}

export default function TechStack({
	title,
	items,
}: TechStackProps): ReactNode {
	return (
		<div className={styles.techStack}>
			<h3 className={styles.title}>{title}</h3>
			<div className={styles.grid}>
				{items.map((item, idx) => (
					<div key={idx} className={clsx('card', styles.techItem)}>
						{item.icon && (
							<div className={styles.icon}>{item.icon}</div>
						)}
						<div className={styles.content}>
							<h4 className={styles.name}>{item.name}</h4>
							{item.description && (
								<p className={styles.description}>
									{item.description}
								</p>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

