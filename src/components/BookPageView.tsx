import { characterAssets } from '../game/characters';
import { mediaUrl, sceneArt, type BookPage } from '../lib/books';
import type { CharacterId } from '../game/types';

/**
 * One page of a book, drawn the same way whether you are writing it or reading
 * it — so what you make really is what everybody else sees.
 *
 * When `onMoveActor` is given the characters can be dragged about; without it
 * the page is just a picture to read.
 */
export function BookPageView({ page, onMoveActor, selectedActor, onPickActor }: {
  page: BookPage;
  onMoveActor?: (actorId: string, x: number, y: number) => void;
  selectedActor?: string | null;
  onPickActor?: (actorId: string | null) => void;
}) {
  const scene = sceneArt(page.background);
  const editing = !!onMoveActor;

  const drag = (actorId: string) => (event: React.PointerEvent) => {
    if (!onMoveActor) return;
    event.preventDefault();
    onPickActor?.(actorId);
    const page = (event.currentTarget as HTMLElement).closest('.book-page') as HTMLElement | null;
    if (!page) return;
    const move = (e: PointerEvent) => {
      const box = page.getBoundingClientRect();
      const x = Math.max(2, Math.min(98, ((e.clientX - box.left) / box.width) * 100));
      const y = Math.max(6, Math.min(96, ((e.clientY - box.top) / box.height) * 100));
      onMoveActor(actorId, x, y);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={`book-page ${scene ? '' : 'plain'}`}
      style={scene ? { backgroundImage: `url(${scene})` } : undefined}
      onPointerDown={editing ? () => onPickActor?.(null) : undefined}
    >
      {page.picture && <img className="book-page-picture" src={mediaUrl(page.picture)} alt="" />}

      {page.actors.map((actor) => (
        <img
          key={actor.id}
          className={`book-actor ${editing ? 'draggable' : ''} ${selectedActor === actor.id ? 'picked' : ''}`}
          src={characterAssets[actor.character as CharacterId] ?? characterAssets.cottontail}
          alt=""
          draggable={false}
          style={{
            left: `${actor.x}%`,
            top: `${actor.y}%`,
            width: `${actor.size}%`,
            transform: `translate(-50%, -100%) scaleX(${actor.flip ? -1 : 1})`,
          }}
          onPointerDown={editing ? drag(actor.id) : undefined}
        />
      ))}

      {page.text.trim() && <p className="book-page-text">{page.text}</p>}
    </div>
  );
}
