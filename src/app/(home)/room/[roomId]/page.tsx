'use client';

import { useParams } from 'next/navigation';

export default function Room() {
	const params = useParams();

	return (
		<div>
			<h1>Room: {params.roomId}</h1>
		</div>
	);
}
