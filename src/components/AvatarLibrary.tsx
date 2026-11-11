import React, { useState } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { AvatarItem } from '../types/studio';
import { API_BASE_URL, readApiJson } from '../utils/api';
import {
  Plus,
  Upload,
  Wand2,
  Copy,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
  AlertCircle,
  User,
  Film,
} from 'lucide-react';

const PRESET_AVATAR_PROMPTS = [
  {
    label: 'Tech Founder',
    look: 'Charismatic person in their mid-30s with short dark wavy hair, wearing a minimalist charcoal crewneck sweater over a white tee, warm confident smile',
    outfit: 'Minimalist modern studio backdrop with soft key lighting',
  },
  {
    label: 'Broadcast Anchor',
    look: 'Poised news presenter in their early 40s with silver-streaked hair and tailored navy suit jacket, crisp articulate expression',
    outfit: 'Executive newsroom slate backdrop with rim lighting',
  },
  {
    label: 'Product Designer',
    look: 'Creative director in their late 20s with stylish round tortoise-shell glasses and olive linen overshirt, friendly approachable expression',
    outfit: 'Warm architectural studio with diffused daylight',
  },
];

export const AvatarLibrary: React.FC = () => {
  const avatars = useStudioStore((s) => s.avatars);
  const defaultAvatarId = useStudioStore((s) => s.defaultAvatarId);
  const addAvatar = useStudioStore((s) => s.addAvatar);
  const updateAvatar = useStudioStore((s) => s.updateAvatar);
  const duplicateAvatar = useStudioStore((s) => s.duplicateAvatar);
  const deleteAvatar = useStudioStore((s) => s.deleteAvatar);
  const setDefaultAvatarId = useStudioStore((s) => s.setDefaultAvatarId);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const updateScene = useStudioStore((s) => s.updateScene);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'ai' | 'upload'>('ai');
  const [newName, setNewName] = useState('');
  const [newLookDescription, setNewLookDescription] = useState(
    PRESET_AVATAR_PROMPTS[0].look
  );
  const [newOutfitVariant, setNewOutfitVariant] = useState(
    PRESET_AVATAR_PROMPTS[0].outfit
  );

  // AI 4-options state
  const [generatingOptions, setGeneratingOptions] = useState(false);
  const [generatedOptions, setGeneratedOptions] = useState<string[]>([]);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number>(0);
  const [createError, setCreateError] = useState<string | null>(null);

  // Upload state
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string>('');

  // Inline rename / edit state
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLook, setEditLook] = useState('');
  const [editOutfit, setEditOutfit] = useState('');

  // Broken image fallback tracking
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleGenerateFourOptions = async () => {
    if (!newLookDescription.trim()) {
      setCreateError('Please enter a look description for your avatar.');
      return;
    }
    setGeneratingOptions(true);
    setCreateError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/avatars/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookDescription: newLookDescription,
          outfitVariant: newOutfitVariant,
          count: 4,
          aspectRatio: '1:1',
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok || !data.images?.length) {
        throw new Error(
          data.error || 'Could not generate avatar options. Please try again.'
        );
      }
      setGeneratedOptions(data.images);
      setSelectedOptionIdx(0);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Avatar generation failed.'
      );
    } finally {
      setGeneratingOptions(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedDataUrl(reader.result);
        setCreateError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNewAvatar = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError('Please enter an avatar name.');
      return;
    }
    if (!newLookDescription.trim()) {
      setCreateError(
        'Please provide a look description so Veo can keep the face consistent across scenes.'
      );
      return;
    }

    let chosenImage = '';
    if (createMode === 'ai') {
      chosenImage = generatedOptions[selectedOptionIdx] || '';
      if (!chosenImage) {
        setCreateError('Generate avatar options before saving this avatar.');
        return;
      }
    } else {
      if (!uploadedDataUrl) {
        setCreateError('Please upload a reference photo first.');
        return;
      }
      chosenImage = uploadedDataUrl;
    }

    addAvatar({
      name: trimmedName,
      imageUrl: chosenImage,
      lookDescription: newLookDescription.trim(),
      outfitVariant:
        newOutfitVariant.trim() || 'Clean studio portrait background',
    });

    setNewName('');
    setGeneratedOptions([]);
    setUploadedDataUrl('');
    setCreateError(null);
    setIsCreateOpen(false);
  };

  const startEditing = (avatar: AvatarItem) => {
    setEditingAvatarId(avatar.id);
    setEditName(avatar.name);
    setEditLook(avatar.lookDescription);
    setEditOutfit(avatar.outfitVariant);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    updateAvatar(id, {
      name: editName.trim(),
      lookDescription: editLook.trim(),
      outfitVariant: editOutfit.trim(),
    });
    setEditingAvatarId(null);
  };

  const applyAvatarToCurrentScene = (avatarId: string) => {
    setDefaultAvatarId(avatarId);
    if (selectedSceneId) {
      updateScene(selectedSceneId, { avatarId });
    }
    setActiveTab('timeline');
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight">
            Avatar Library
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Create reusable digital presenters from a reference photo or
            4-option Gemini image generation. Each avatar saves a persistent
            look description injected into every Veo scene prompt for facial
            consistency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Avatar</span>
        </button>
      </div>

      {/* Avatar Grid */}
      {avatars.length === 0 && (
        <div className="p-8 rounded-xl bg-[#0B0F19] border border-dashed border-slate-700 text-center">
          <User className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-white">
            Create your first avatar
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Upload your own reference photo or generate an avatar to get started.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {avatars.map((avatar) => {
          const isDefault = avatar.id === defaultAvatarId;
          const isEditing = editingAvatarId === avatar.id;
          const imgFailed = failedImages[avatar.id];

          return (
            <div
              key={avatar.id}
              className={`flex flex-col bg-[#111827] border rounded-xl overflow-hidden transition-colors ${
                isDefault
                  ? 'border-indigo-500/80'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Reference Frame Preview */}
              <div className="relative aspect-square w-full bg-slate-900 overflow-hidden">
                {!imgFailed && avatar.imageUrl ? (
                  <img
                    src={avatar.imageUrl}
                    alt={avatar.name}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [avatar.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-6 text-center">
                    <User className="w-12 h-12 text-indigo-400 mb-2" />
                    <span className="text-sm font-semibold text-slate-200">
                      {avatar.name}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Studio Reference Frame
                    </span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 flex items-end justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white font-display">
                      {avatar.name}
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {isDefault
                        ? 'Default Project Presenter · Reference Ready'
                        : 'Studio Presenter · Reference Ready'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor={`edit-name-${avatar.id}`}
                        className="block text-xs font-medium text-slate-300 mb-1"
                      >
                        Avatar Name
                      </label>
                      <input
                        id={`edit-name-${avatar.id}`}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm bg-[#0B0F19] border border-slate-700 rounded-md text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`edit-look-${avatar.id}`}
                        className="block text-xs font-medium text-slate-300 mb-1"
                      >
                        Saved Look Description (Veo Consistency Prompt)
                      </label>
                      <textarea
                        id={`edit-look-${avatar.id}`}
                        rows={3}
                        value={editLook}
                        onChange={(e) => setEditLook(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0F19] border border-slate-700 rounded-md text-slate-200"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`edit-outfit-${avatar.id}`}
                        className="block text-xs font-medium text-slate-300 mb-1"
                      >
                        Outfit / Background Variant
                      </label>
                      <input
                        id={`edit-outfit-${avatar.id}`}
                        type="text"
                        value={editOutfit}
                        onChange={(e) => setEditOutfit(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0F19] border border-slate-700 rounded-md text-slate-200"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => saveEdit(avatar.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAvatarId(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-md cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">
                        Look Description:
                      </span>
                      <p className="text-slate-200 mt-0.5 leading-relaxed line-clamp-3">
                        {avatar.lookDescription}
                      </p>
                    </div>
                    {avatar.outfitVariant && (
                      <div className="pt-2 border-t border-slate-800/80 text-slate-400">
                        <span>Variant: </span>
                        <span className="text-slate-300">
                          {avatar.outfitVariant}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => applyAvatarToCurrentScene(avatar.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/50 hover:bg-indigo-600 border border-indigo-800/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Use in Scene</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditing(avatar)}
                      aria-label={`Rename or edit ${avatar.name}`}
                      title="Rename & Edit Look"
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateAvatar(avatar.id)}
                      aria-label={`Duplicate ${avatar.name}`}
                      title="Duplicate Avatar"
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAvatar(avatar.id)}
                      aria-label={`Delete ${avatar.name}`}
                      title="Delete Avatar"
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Avatar Modal */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-avatar-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2
                id="create-avatar-modal-title"
                className="text-lg font-semibold text-white font-display"
              >
                Create Reusable Avatar
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close Create Avatar Modal"
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewAvatar} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Segmented Mode Selector */}
              <div className="flex items-center gap-1 p-1 bg-[#0B0F19] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCreateMode('ai')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    createMode === 'ai'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Describe in Text (Gemini 4 Options)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode('upload')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    createMode === 'upload'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Reference Photo</span>
                </button>
              </div>

              {/* Avatar Name */}
              <div>
                <label
                  htmlFor="new-avatar-name"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Avatar Name
                </label>
                <input
                  id="new-avatar-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Jordan Vance — Product Lead"
                  className="w-full px-3.5 py-2 text-sm bg-[#0B0F19] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Look Description + Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="new-avatar-look"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Saved Look Description (Reused in Every Veo Prompt)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {PRESET_AVATAR_PROMPTS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setNewLookDescription(preset.look);
                          setNewOutfitVariant(preset.outfit);
                        }}
                        className="px-2 py-0.5 text-[11px] text-indigo-300 hover:text-white bg-indigo-950/50 border border-indigo-800/50 rounded transition-colors cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="new-avatar-look"
                  rows={3}
                  value={newLookDescription}
                  onChange={(e) => setNewLookDescription(e.target.value)}
                  placeholder="Describe facial features, age range, hair style, glasses, and expression..."
                  className="w-full p-3 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-100 leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Outfit / Background Variant */}
              <div>
                <label
                  htmlFor="new-avatar-outfit"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Outfit & Studio Background Variant (Optional)
                </label>
                <input
                  id="new-avatar-outfit"
                  type="text"
                  value={newOutfitVariant}
                  onChange={(e) => setNewOutfitVariant(e.target.value)}
                  placeholder="e.g., Navy blazer against warm minimalist office backdrop"
                  className="w-full px-3.5 py-2 text-xs bg-[#0B0F19] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* AI 4 Options Generator or Upload Photo */}
              {createMode === 'ai' ? (
                <div className="space-y-3 p-4 bg-[#0B0F19] border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Generate 4 Portrait Options with Gemini
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Produces 4 studio reference frames to pick from (or save
                        immediately with default reference).
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={generatingOptions}
                      onClick={handleGenerateFourOptions}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {generatingOptions ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating 4 Options...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Generate 4 Options</span>
                        </>
                      )}
                    </button>
                  </div>

                  {generatedOptions.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      {generatedOptions.map((imgSrc, idx) => {
                        const isPicked = selectedOptionIdx === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedOptionIdx(idx)}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                              isPicked
                                ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                                : 'border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <img
                              src={imgSrc}
                              alt={`Generated Avatar Option ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-black/75 text-white rounded">
                              Option {idx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-[#0B0F19] border border-slate-800 rounded-lg space-y-3">
                  <label
                    htmlFor="avatar-photo-upload"
                    className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-700 hover:border-indigo-500 rounded-lg cursor-pointer transition-colors text-center"
                  >
                    <Upload className="w-6 h-6 text-indigo-400 mb-2" />
                    <span className="text-xs font-semibold text-white">
                      Click to upload a portrait photo (PNG, JPG, WebP)
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Used as the reference frame for Veo image-to-video
                      generation
                    </span>
                    <input
                      id="avatar-photo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                  {uploadedDataUrl && (
                    <div className="flex items-center gap-3 pt-2">
                      <img
                        src={uploadedDataUrl}
                        alt="Uploaded reference preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-emerald-400">
                          Reference photo loaded
                        </p>
                        <p className="text-slate-400">
                          Ready to save with your look description.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {createError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Avatar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
