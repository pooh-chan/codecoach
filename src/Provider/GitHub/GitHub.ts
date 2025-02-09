import { VCS } from '..';
import { Log } from '../../Logger';
import { LogSeverity, LogType } from '../../Parser';
import { Diff } from '../@types/PatchTypes';
import { onlyIn, onlySeverity } from '../utils/filter.util';
import { MessageUtil } from '../utils/message.util';
import { Comment } from '../@types/CommentTypes';
import { CommitStatus } from './CommitStatus';
import { IGitHubPRService } from './IGitHubPRService';
import { groupComments } from '../utils/commentUtil';

export class GitHub implements VCS {
  private commitId: string;
  private touchedDiff: Diff[];
  private comments: Comment[];
  private nWarning: number;
  private nError: number;

  constructor(
    private readonly prService: IGitHubPRService,
    private readonly removeOldComment: boolean = false,
  ) {}

  async report(logs: LogType[]): Promise<boolean> {
    try {
      await this.setup(logs);

      if (this.removeOldComment) {
        await this.removeExistingComments();
      }

      await Promise.all(this.comments.map((c) => this.createReviewComment(c)));
      await this.createSummaryComment();
      await this.setCommitStatus();

      Log.info('Report commit status completed');
    } catch (err) {
      Log.error('GitHub report failed', err);
      throw err;
    }

    return true; // As GitHub has commit status report separately
  }

  private async createSummaryComment() {
    if (this.nWarning + this.nError > 0) {
      const overview = MessageUtil.generateOverviewMessage(this.nError, this.nWarning);
      await this.prService.createComment(overview);
      Log.info('Create summary comment completed');
    } else {
      Log.info('No summary comment needed');
    }
  }

  private async setCommitStatus() {
    const commitStatus = this.nError > 0 ? CommitStatus.failure : CommitStatus.success;
    const description = MessageUtil.generateCommitDescription(this.nError);

    await this.prService.setCommitStatus(this.commitId, commitStatus, description);
  }

  private async setup(logs: LogType[]) {
    this.commitId = await this.prService.getLatestCommitSha();
    this.touchedDiff = await this.prService.diff();

    const touchedFileLog = logs
      .filter(onlySeverity(LogSeverity.error, LogSeverity.warning))
      .filter(onlyIn(this.touchedDiff));

    this.comments = groupComments(touchedFileLog);
    this.nError = this.comments.reduce((sum, comment) => sum + comment.errors, 0);
    this.nWarning = this.comments.reduce((sum, comment) => sum + comment.warnings, 0);

    Log.debug(`VCS Setup`, {
      sha: this.commitId,
      diff: this.touchedDiff,
      comments: this.comments,
      err: this.nError,
      warning: this.nWarning,
    });
  }

  private async createReviewComment(comment: Comment): Promise<Comment> {
    const { text, file, line } = comment;

    await this.prService.createReviewComment(this.commitId, text, file, line);
    Log.debug('GitHub create review success', { text, file, line });
    return comment;
  }

  private async removeExistingComments(): Promise<void> {
    const [userId, comments, reviews] = await Promise.all([
      this.prService.getCurrentUserId(),
      this.prService.listAllComments(),
      this.prService.listAllReviewComments(),
    ]);
    Log.debug('Get existing CodeCoach comments completed');

    const deleteComments = comments
      .filter((comment) => comment.user?.id === userId)
      .map((comment) => this.prService.deleteComment(comment.id));

    const deleteReviews = reviews
      .filter((review) => review.user?.id === userId)
      .map((review) => this.prService.deleteReviewComment(review.id));

    await Promise.all([...deleteComments, ...deleteReviews]);
    Log.debug('Delete CodeCoach comments completed');
  }
}
