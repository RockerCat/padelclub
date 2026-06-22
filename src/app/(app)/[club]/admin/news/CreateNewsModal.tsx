"use client";

import { SettingsModuleModal } from "../settings/SettingsModuleModal";
import { NewsForm } from "./NewsForm";
import { createNews } from "./actions";

interface CreateNewsModalProps {
  clubId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateNewsModal({ clubId, onClose, onSuccess }: CreateNewsModalProps) {
  const boundCreate = createNews.bind(null, clubId);

  return (
    <SettingsModuleModal title="Nueva noticia" onClose={onClose} size="lg">
      <NewsForm clubId={clubId} action={boundCreate} onSuccess={onSuccess} onCancel={onClose} />
    </SettingsModuleModal>
  );
}
