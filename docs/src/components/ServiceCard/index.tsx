import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface ServiceCardProps {
	title: string;
	description: ReactNode;
	icon?: string;
	link?: string;
	category?: string;
}

export default function ServiceCard({
	title,
	description,
	icon,
	link,
	category,
}: ServiceCardProps): ReactNode {
	const content = (
		<div className={clsx('card', styles.serviceCard)}>
			{icon && (
				<div className={styles.iconContainer}>
					<span className={styles.icon}>{icon}</span>
				</div>
			)}
			{category && (
				<div className={styles.category}>{category}</div>
			)}
			<h3 className={styles.title}>{title}</h3>
			<p className={styles.description}>{description}</p>
		</div>
	);

	if (link) {
		return (
			<Link to={link} className={styles.link}>
				{content}
			</Link>
		);
	}

	return content;
}

