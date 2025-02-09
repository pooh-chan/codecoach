import { GitLab } from './GitLab';
import { IGitLabMRService } from './IGitLabMRService';
import {
  mockTouchDiff,
  touchFileError,
  touchFileWarning,
  untouchedError,
  untouchedWarning,
} from '../mockData';
import { DiffSchema, MergeRequestNoteSchema } from '@gitbeaker/core/dist/types/types';

const mockCurrentUserId = 123456;
const mockNoteIdToBeDeleted = 6544321;

const mockNotes = [
  { id: 1, author: { id: mockCurrentUserId }, system: true },
  { id: mockNoteIdToBeDeleted, author: { id: mockCurrentUserId }, system: false }, // only one to be deleted
  { id: 3, author: { id: 99 }, system: false },
] as MergeRequestNoteSchema[];

const mockVersionId = 3425234;
const mockVersion = {
  id: mockVersionId,
} as DiffSchema;

class MrServiceMock implements IGitLabMRService {
  createMRDiscussion = jest.fn().mockResolvedValue(undefined);
  createNote = jest.fn().mockResolvedValue(undefined);
  deleteNote = jest.fn().mockResolvedValue(undefined);
  diff = jest.fn().mockResolvedValue([mockTouchDiff]);
  getCurrentUserId = jest.fn().mockResolvedValue(mockCurrentUserId);
  getLatestVersion = jest.fn().mockResolvedValue(mockVersion);
  listAllNotes = jest.fn().mockResolvedValue(mockNotes);
}

describe('VCS: GitLab', () => {
  it('should returns true when there is no error', async () => {
    const service = new MrServiceMock();
    const gitLab = new GitLab(service, true);

    const result = await gitLab.report([
      touchFileError,
      touchFileWarning,
      untouchedError,
      untouchedWarning,
    ]);

    expect(result).toBe(false);
  });

  it('should returns false when there is some error', async () => {
    const service = new MrServiceMock();
    const gitLab = new GitLab(service, true);

    const result = await gitLab.report([
      touchFileWarning,
      untouchedError,
      untouchedWarning,
    ]);

    expect(result).toBe(true);
  });

  it('should remove old self comments and reviews and post new ones', async () => {
    const service = new MrServiceMock();
    const gitLab = new GitLab(service, true);

    await gitLab.report([
      touchFileError,
      touchFileWarning,
      untouchedError,
      untouchedWarning,
    ]);

    expect(service.listAllNotes).toHaveBeenCalledTimes(1);
    expect(service.getCurrentUserId).toHaveBeenCalledTimes(1);

    expect(service.deleteNote).toHaveBeenCalledTimes(1);
    expect(service.deleteNote).toHaveBeenCalledWith(mockNoteIdToBeDeleted);

    expect(service.createMRDiscussion).toHaveBeenNthCalledWith(
      1,
      mockVersion,
      touchFileError.source,
      touchFileError.line,
      expect.any(String),
    );

    expect(service.createMRDiscussion).toHaveBeenNthCalledWith(
      2,
      mockVersion,
      touchFileWarning.source,
      touchFileWarning.line,
      expect.any(String),
    );

    expect(service.createNote).toHaveBeenCalledTimes(1);
  });

  it('should not comment if there is no relevant lint issue', async () => {
    const service = new MrServiceMock();
    const gitLab = new GitLab(service, true);

    await gitLab.report([untouchedError, untouchedWarning]);

    expect(service.createMRDiscussion).not.toHaveBeenCalled();
    expect(service.createNote).not.toHaveBeenCalled();
  });
});
