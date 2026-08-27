/**
 * @file CheckLegalDaysOffFor5JRuleParam.h
 * @brief Rule 7365 - Legal Days Off validation for 5J
 *
 * [CMSCEB-1178 Phase4] 校验窗 [startLoc, endLoc] 表示合法休息，实现要点：
 *   支柱1 — end 止于 DO 后第一条阻塞 roster 的开工点（AS/FLY 相同，见 GetFirstBlockingEndCapLocAfterIndex）
 *   支柱2 — 开区间内不得夹非 DO 执勤（HasInteriorNonGroupRosterOverlap）
 *   支柱3/4 — 窗内时长与 LN（ValidateDayOffGroupFull / CountLocalNightsInWindow）
 *   支柱5 — LN/时长不足时向后扩 OFF 后空白天（TryExtendGroupEndForLegalRequirements）
 *   支柱6 — 仍不足则前导空白天 v2 前移 start（GetFirstLeadingBlankBlockStartLoc 等）
 *   支柱7 — OFF 与邻接 duty 重叠时裁切校验窗（TrimValidationWindowForDutyOverlap，见 7365.md）
 *
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-04-14
**/

#ifndef _CHECKLEGALDAYSOFFFOR5JRULEPARAM_H_
#define _CHECKLEGALDAYSOFFFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "period/RestPeriod.h"

class CheckLegalDaysOffFor5JRule;
class Rule7365TestAccess;

class CheckLegalDaysOffFor5JRuleParam : public RuleParam {
    friend class CheckLegalDaysOffFor5JRule;
    friend class Rule7365TestAccess;
private:
    explicit CheckLegalDaysOffFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7365;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
        DAYS_OFF_ASSIGNMENT_GROUPS = 0,
        DAYS_OFF_ASSIGNMENTS = 1,
        DAY_OFF_DURATION = 2,
        LOCAL_NIGHTS = 3,
        ADDITIONAL_DAY_OFF_DURATION = 4,
        ADDITIONAL_DAY_OFF_LOCAL_NIGHT = 5,
        INCLUDE_BLANK_DAY = 6,
        INCLUDE_LAYOVER_REST = 7,
        INCLUDE_PAIRING_BASE_REST = 8
    };

    // Days Off的Assignment Groups列表。多个值使用"|"分隔并支持*通配
    std::vector<string> _daysOffAssignmentGroups{};
    AssignmentGroupMatchExpression<Activity> _daysOffAssignmentGroupsMatch;

    // Days Off的Assignments列表。多个值使用"|"分隔并支持*通配
    std::vector<string> _daysOffAssignments{};
    AssignmentMatchExpression<Activity> _daysOffAssignmentsMatch;

    // 第一个DO持续时间，格式：HH:MM (对于该RULE来说，隐含至少1个完整日历日)
    std::string _dayOffDurationStr{};
    int _dayOffDurationMinutes{ 0 };

    // 需要满足Local Night数量（依赖Local Night定义RULE），支持 * 通配符（忽略），格式：整数
    std::string _localNightsStr{};
    int _localNights{ 0 };

    // 连续DO(第二个以后的DO)持续时间, 格式：HH:MM (对于该RULE来说，隐含至少1个完整日历日)
    std::string _additionalDayOffDurationStr{};
    int _additionalDayOffDurationMinutes{ 0 };

    // 连续DO(第二个以后的DO)需要满足Local Night数量
    std::string _additionalDayOffLocalNightStr{};
    int _additionalDayOffLocalNight{ 0 };

    // Y/N，是否包括空白天
    std::string _includeBlankDay{};

    // Y/N，是否包括Layover Rest
    std::string _includeLayoverRest{};

    // Y/N，是否包括Pairing在基地的Rest
    std::string _includePairingBaseRest{};

    void ParseParam(const std::string& paramString);

    void ParseParam(const DBRule& dbRule);

public:
    struct DayOffGroupInfo {
        std::vector<const ROSTER*> rosters;
        time_t startUtc{ 0 };
        time_t endUtc{ 0 };
        time_t startLoc{ 0 };
        time_t endLoc{ 0 };
    };

    bool MatchDoAssignment(const Activity* activity) const;

    // 验证连续DO组是否符合时长和local night要求
    // groupStartLoc: 连续DO组的开始时间（本地时间）
    // groupEndLoc: 连续DO组的结束时间（本地时间）
    // numDaysOff: 连续DO的数量
    bool ValidateDayOffGroup(const time_t groupStartLoc, const time_t groupEndLoc, int numDaysOff) const;

    // 获取连续DO组
    std::vector<std::vector<const ROSTER*>> GetConsecutiveDayOffGroups(const std::vector<const ROSTER*>& rosters) const;

    // 获取包括空白天的休息时间
    std::vector<DayOffGroupInfo> GetConsecutiveDayOffGroupInfos(const std::vector<const ROSTER*>& rosters, const string& base) const;

    /**
     * [CMSCEB-1178 Phase4] Roster Editor 分配 OFF 时的主校验入口（Include Blank Day=Y）。
     *
     * 校验窗 [startLoc, endLoc] 仅表示合法休息（DO/OFF + 前后空白天），不含窗内执勤。
     * 流程：后向定 end → 后扩凑 LN/时长 → OFF 重叠裁切 → 终检 → 不足则前导空白天 v2 前移 start 并重复。
     * 参见 7365.md 场景 1–6。
     */
    bool ValidateDayOffGroupWithLeadingBlankDayFallback(DayOffGroupInfo& group,
        const std::vector<const ROSTER*>& allRosters, const string& base, const CrewDataContext& dbData) const;

    time_t GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base) const;
    time_t GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base) const;

    // 判断是否连续休息
    bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster) const;
    bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty) const;

private:
    static bool IsRosterInDayOffGroup(const ROSTER* roster, const std::vector<const ROSTER*>& groupRosters);

    void GetRosterActivityLocInterval(const ROSTER* roster, bool includePairingBaseRest, time_t& outStartLoc,
        time_t& outEndLoc) const;

    bool HasNonGroupRosterOverlapInLocRange(const std::vector<const ROSTER*>& allRosters,
        const std::vector<const ROSTER*>& groupRosters, time_t rangeStartLoc, time_t rangeEndLoc,
        bool includePairingBaseRest) const;

    void GetRequiredLegalDayOffTotals(int numDaysOff, int& requiredDurationMinutes,
        int& requiredLocalNights) const;

    int GetDurationDeficitMinutes(time_t groupStartLoc, time_t groupEndLoc, int numDaysOff) const;

    int GetBackwardExpansionStepMinutes(time_t groupStartLoc, time_t groupEndLoc, int numDaysOff,
        const std::vector<const ROSTER*>& groupRosters) const;

    time_t GetFirstLeadingBlankBlockStartLoc(time_t anchorStartLoc, const std::vector<const ROSTER*>& allRosters,
        const std::vector<const ROSTER*>& groupRosters, const string& base, const CrewDataContext& dbData) const;

    time_t ClampStartToValidLeadingBlank(time_t candidateStartLoc, time_t anchorStartLoc, time_t earliestLoc,
        const std::vector<const ROSTER*>& allRosters, const std::vector<const ROSTER*>& groupRosters) const;

    // [Phase4 支柱1] 将 end 至少延到 DO 后第一条阻塞执勤开工点（地面 AS / 配对 FLY 相同）
    void ExtendGroupEndToNextGroundRosterAfterBlank(DayOffGroupInfo& group,
        const std::vector<const ROSTER*>& allRosters, std::size_t afterRosterIndex,
        const string& base, const CrewDataContext* dbData) const;

    // [Phase4 支柱2] 开区间 (start,end) 内是否夹有非 DO 执勤（禁止窗穿过 AS/FLY，场景3/5）
    bool HasInteriorNonGroupRosterOverlap(time_t windowStartLoc, time_t windowEndLoc,
        const std::vector<const ROSTER*>& allRosters, const std::vector<const ROSTER*>& groupRosters) const;

    // [Phase4 支柱4] 窗内 LN 计数（仅 DutyUtils::GetLocalNightNums，不对 OFF 日历日另加额度）
    static int CountLocalNightsInWindow(time_t windowStartLoc, time_t windowEndLoc);

    // [Phase4 终检] 支柱2 无夹执勤 + 支柱3 时长 + 支柱4 LN（后扩/前扩后均调用）
    bool ValidateDayOffGroupFull(time_t windowStartLoc, time_t windowEndLoc, int numDaysOff,
        const std::vector<const ROSTER*>& groupRosters,
        const std::vector<const ROSTER*>& allRosters) const;

    /**
     * [Phase4 支柱1] DO 组之后第一条阻塞 roster 的 end 上界（基地本地时间）。
     * 地面 AS、配对 FLY 统一取开工点 actStrLoc / pairing->getStartTimeLocAct()；
     * 勿将 FLY 上界取为日历日 00:00（场景6 会误报）。无后续 roster 时返回 max()。
     */
    static time_t GetFirstBlockingEndCapLocAfterIndex(const std::vector<const ROSTER*>& allRosters,
        std::size_t afterRosterIndex, time_t notBeforeEndUtc);

    // [Phase4 支柱5] LN/时长不足时向后纳入 OFF 后空白天，上界 = min(下一阻塞开工点, scenario.end)
    void TryExtendGroupEndForLegalRequirements(DayOffGroupInfo& group,
        const std::vector<const ROSTER*>& allRosters, std::size_t lastDoRosterIndexInList,
        const string& base, const CrewDataContext* dbData) const;

    // [Phase4 支柱7] OFF 日历并集与 non-DO 重叠时裁切 [start,end]（终检前调用）
    bool TrimValidationWindowForDutyOverlap(DayOffGroupInfo& group,
        const std::vector<const ROSTER*>& allRosters, const string& base,
        const CrewDataContext* dbData) const;

    static void GetDayOffUnionLocInterval(const std::vector<const ROSTER*>& groupRosters,
        time_t& outUnionStartLoc, time_t& outUnionEndLoc);

    static time_t GetScenarioEndLoc(const CrewDataContext& dbData, const string& base);

    static time_t CalculateMinEndForTwoLocalNights(time_t startLoc, const string& base);

    // 满足 requiredLocalNights 个完整 LN 带所需的最小 end（后扩几何下界）
    static time_t CalculateMinEndForRequiredLocalNights(time_t startLoc, int requiredLocalNights,
        const string& base);

    static time_t GetScenarioStartLoc(const CrewDataContext& dbData, const string& base);

    static time_t LocToUtcForBase(time_t loc, const string& base, const CrewDataContext& dbData);
};

#endif //_CHECKLEGALDAYSOFFFOR5JRULEPARAM_H_
