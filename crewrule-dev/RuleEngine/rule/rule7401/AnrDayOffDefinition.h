#ifndef RULEENGINE_RULE7401_ANRDAYOFFDEFINITION_H_
#define RULEENGINE_RULE7401_ANRDAYOFFDEFINITION_H_

#include <string>
#include <vector>

#include "CrewDB.h"

/**
 * @brief Rule 7401 definition for ANR day off requirements.
 *
 * This definition is shared by other ANR rules to understand how many
 * consecutive hours and local nights are needed for each day-off sequence.
 * It supports parsing DB tables as well as defaulting to the design-table
 * values when the DB is not populated.
 */

static constexpr int DO_FORWARD_EXT_DURATION = 24 * 3600;//DO向前延伸时长，单位：秒
static constexpr int DO_BACKWARD_EXT_DURATION = 24 * 3600;//DO向后延伸时长，单位：秒

class AnrDayOffDefinition {
public:
    static constexpr int RuleFuncId = 7401;
    AnrDayOffDefinition();

    struct Requirement {
        long long idRule = 0;
        long long idRuleParam = 0;
        int rowNum = 0;
        int sequenceLower = 0;
        int sequenceUpper = 0;
        int minRestMinutes = 0;
        int minLocalNights = 0;

        bool matchesSequence(int seq) const {
            return seq >= sequenceLower &&
                   (sequenceUpper == 0 || seq <= sequenceUpper);
        }
    };

    struct RequirementEx {
        long long idRule = 0;
        long long idRuleParam = 0;
        int rowNum = 0;

        //DO任务组。多个值使用“|”分隔并支持*通配
        vector<string> doAssignmentGroups;

        //DO延伸到任务组（DO可以向前或先后扩展时长，与该组任务重叠来满足DDO定义要求)。多个值使用“|”分隔并支持*通配
        vector<string> doExtensionAssignmentGroups;

        //空白天是否计入DDO。取值：Y/N
        bool isBlankDayCountedDO{ true };

        bool isWorkAssignment(const string& assignment, const shared_ptr<CrewDataContext>& dbData) const {
            return !dbData->isAssignmentInGroup(assignment, this->doAssignmentGroups)
                && !dbData->isAssignmentInGroup(assignment, this->doExtensionAssignmentGroups);
        }

        bool isDoAssignment(const string& assignment, const shared_ptr<CrewDataContext>& dbData) const {
            return dbData->isAssignmentInGroup(assignment, this->doAssignmentGroups);
        }

        bool isDoExtensionAssignment(const string& assignment, const shared_ptr<CrewDataContext>& dbData) const {
            return dbData->isAssignmentInGroup(assignment, this->doExtensionAssignmentGroups);
        }
    };

    void loadFromDbRules(const std::vector<DBRule>& dbRules);

    const std::vector<Requirement>& rows() const { return _reqRows; }

    const RequirementEx& getReqExRow() const { return _reqExRow; }

    bool empty() const { return _reqRows.empty(); }

    const Requirement* findRequirementForSequence(int sequence) const;
    int getRequiredRestMinutesForDayOffCount(int dayOffCount) const;
    int getRequiredLocalNightsForDayOffCount(int dayOffCount) const;

	// 统计休息期间内ANR定义的休息天数
    int countDaysOffInRest(time_t restStartUtc,
        time_t restEndUtc,
        int offsetMinutes,
        const std::string& zoneId = "") const;

 	//获得休息期间内ANR定义的休息时间段,返回所有DO时间段的<startTimePeriod,endTimePeriod>数组
    vector<std::tuple<time_t, time_t>> getDaysOffInRest(time_t restStartUtc,
        time_t restEndUtc,
        int offsetMinutes,
        const std::string& zoneId = "") const;    

    //获得满足DO的时间段,<开始时间(本地时区),结束时间(本地时区)>, crewMandayMap:<manday日期(本地时区)，Manday>
    vector<std::tuple<time_t, time_t>> getDaysOffPeriodsByRoster(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const shared_ptr<CrewDataContext>& dbData,
        const time_t startDtUTC, const time_t endDtUTC,
        const int offsetMinutes,
        const std::string& zoneId = "") const;

    //获得startIndex前序连续满足DO的时间段,<开始时间(本地时区),结束时间(本地时区)>，startIndex必须是工作任务
    vector<std::tuple<time_t, time_t>> getPreConsecutiveDaysOffPeriods(const std::vector<const ROSTER*>& rosters, const int startIndex, const shared_ptr<CrewDataContext>& dbData,
        const time_t startDtUTC, const time_t endDtUTC,
        const int offsetMinutes, const std::string& zoneId = "") const;

    //获得endIndex后序连续满足DO的时间段,<开始时间(本地时区),结束时间(本地时区)>，endIndex必须是工作任务
    vector<std::tuple<time_t, time_t>> getPostConsecutiveDaysOffPeriods(const std::vector<const ROSTER*>& rosters, const int endIndex, const shared_ptr<CrewDataContext>& dbData,
        const time_t startDtUTC, const time_t endDtUTC,
        const int offsetMinutes, const std::string& zoneId = "") const;

    /**
    * 获得DO所在日期
    * 由于第一个DDO/单独的一个DDO必须连续34小时且有2个Local Night, 后续连续DDO的满足連續24小时1個localnight(FD和CC有差别)，
    * 因此第一个DDO必然有个完整天，第二个DDO不是完整天，但会记录为第一个DDO日期之后，接一来作为DDO
    * @param DO时间段列表 <开始时间(本地时区),结束时间(本地时区)>
    * @return DO所属日期（本地时区）列表
    */
    vector<time_t> getDaysOffDates(const vector<std::tuple<time_t, time_t>>& daysOffPeriods) const;
    time_t getDaysOffDate(const time_t ddoStartLoc, const time_t ddoEndLoc) const;
private:
    void parseReqRow(const DBRule& dbRule);
    void parseReqExRow(const DBRule& dbRule);
    void ensureDefaultRows();
    static int parseDurationToMinutes(const std::string& value);
    static void parseSequenceRange(const std::string& value,
                                   int& lower,
                                   int& upper);

    std::vector<Requirement> _reqRows;

    RequirementEx _reqExRow;//仅支持一行扩展参数配置
};

#endif  // RULEENGINE_RULE7401_ANRDAYOFFDEFINITION_H_
