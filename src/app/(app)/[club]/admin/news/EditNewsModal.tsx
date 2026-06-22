"use client";

import { SettingsModuleModal } from "../settings/SettingsModuleModal";
import { NewsForm } from "./NewsForm";
import { updateNews } from "./actions";
import type { ClubNews } from "@/types/database";

interface EditNewsModalProps {
  clubId: string;
  news: ClubNews;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditNewsModal({ clubId, news, onClose, onSuccess }: EditNewsModalProps) {
  const boundUpdate = updateNews.bind(null, clubId, news.id);

  return (
    <SettingsModuleModal title="Editar noticia" onClose={onClose} size="lg">
      <NewsForm clubId={clubId} news={news} action={boundUpdate} onSuccess={onSuccess} onCancel={onClose} />
    </SettingsModuleModal>
  );
}
