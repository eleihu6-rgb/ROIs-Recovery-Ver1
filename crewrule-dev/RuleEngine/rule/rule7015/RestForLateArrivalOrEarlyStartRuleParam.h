/**
 * @file RestForLateArrivalOrEarlyStartRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _RESTFORLATEARRIVALOREARLYSTARTRULEPARAM_H_
#define _RESTFORLATEARRIVALOREARLYSTARTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckRestForLateArrivalOrEarlyStartRule;

class RestForLateArrivalOrEarlyStartRuleParam : public RuleParam {
	friend class CheckRestForLateArrivalOrEarlyStartRule;
private:
    explicit RestForLateArrivalOrEarlyStartRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7015;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS = 4,
		NEXT_ROSTER_ASSIGNMENTS = 5,
		START_OR_END = 6,
		LOCAL_START_TIME = 7,
		LOCAL_END_TIME = 8,
		MIN_GAP_BETWEEN_ROSTERS = 9,
		INCLUDING_REST_AT_BASE = 10,
		NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME = 11,
		SEVERITY = 12
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//当前Roster的任务类型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _assignments{};

	//下一个Roster任务类型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _nextRosterAssignments{};

	//开始时间或结束时间,使用Roster的开始检查还是结束检查。取值：S开始、E结束
	std::string _rosterStartOrEnd{ "E" };
	
	//开始时间（本地时间）,格式：HH:mm
	std::string _localStartTime{};
	int _localStartTimeMinutes{ INT_MIN };

	//结束时间（本地时间）,格式：HH:mm
	std::string _localEndTime{};
	int _localEndTimeMinutes{ INT_MAX };
	
	//Roster间最小间隔时间(分钟数),格式：HH:mm
	std::string _minGapBetweenRosters{};
	int _minGapBetweenRostersMinutes{ 0 };

	//Roster间最小间隔时间是否包含基地休息时长,取值：Y - 包含（是），N-不包含（否）
	std::unique_ptr<bool> _isIncludingRestAtBase{nullptr};

	//后一个Roster不能在第二天的X前开始,格式：HH:mm
	std::string _nextRosterShouldNotBeforeTime{};
	int _nextRosterShouldNotBeforeTimeMinutes{ 0 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断当前Roster所在时间范围
	bool MatchRosterTime(const ROSTER* currRoster) const;

	bool MatchAssignments(const ROSTER* currRoster) const;

	bool MatchNextRosterAssignments(const ROSTER* nextRoster) const;

	//检查“Roster间最小间隔时间(分钟数)”
	bool CheckMinGapBetweenRosters(const ROSTER* currRoster, const ROSTER* nextRoster) const;

	//检查“后一个Roster不能在第二天的X前开始”
	bool CheckNextRosterShouldNotBeforeTime(const ROSTER* currRoster, const ROSTER* nextRoster) const;
public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		MIN_GAP_BETWEEN_ROSTERS_WARN = 1, //“Roster间最小间隔时间”不满足告警
		NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME_WARN = 2 //“后一个Roster不能在第二天的X前开始”不满足告警
	};

	//匹配是否满足参数
	bool MatchParam(const ROSTER* currRoster, const ROSTER* nextRoster) const;

	//检查是否满足参数
	int CheckParam(const ROSTER* currRoster, const ROSTER* nextRoster) const;
};

#endif //_RESTFORLATEARRIVALOREARLYSTARTRULEPARAM_H_
