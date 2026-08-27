/**
 * @file CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-21
**/

#ifndef _CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULEPARAM_H_
#define _CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule;

class CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam : public RuleParam {
	friend class CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule;
private:
    explicit CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7326;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 13;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ATTRIBUTES = 5,
		ASSIGNMENTS = 6,
		ASSIGNMENT_GROUPS = 7,
		BEFORE_OR_AFTER_ASSIGNMENTS = 8,
		BEFORE_OR_AFTER_ASSIGNMENT_GROUPS = 9,
		CONSECUTIVE_ASSIGNMENT_DAYS = 10,
		EARLIEST_BRIEF_AFTER_ROSTER = 11,
		LATEST_DEBRIEF_BEFORE_ROSTER = 12,
		SEVERITY = 13
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//当前Roster的Pairing标签列表。多个值使用“|”分隔并支持*通配
	string _strPairingAttributes;
	vector<string> _pairingAttributes{};

	//当前Roster的Assignment列表。多个值使用“|”分隔并支持*通配。当前Roster可能是飞行任务或地面任务
	vector<string> _assignments{};

	//当前Roster的Assignment Group列表。多个值使用“|”分隔并支持*通配。当前Roster可能是飞行任务或地面任务
	vector<string> _assignmentGroups{};

	//前面Roster的Assignment列表。多个值使用“|”分隔并支持*通配。
	vector<string> _beforeAssignments{};

	//前面Roster的Assignment Groups列表。多个值使用“|”分隔并支持*通配。
	vector<string> _beforeAssignmentGroups{};

	//后面Roster的Assignment列表。多个值使用“|”分隔并支持*通配。
	vector<string> _afterAssignments{};

	//后面Roster的Assignment Group列表。多个值使用“|”分隔并支持*通配。
	vector<string> _afterAssignmentGroups{};

	//当前任务并满足Assignments的连续天数，格式:n-m，取值范围:[n,m), 例如：1-99（代表1天或者多天，2-99为至少连续两天）
	string _consecutiveAssignmentDays;
	int _consecutiveAssignmentDaysLower{ 0 };
	int _consecutiveAssignmentDaysUpper{ INT_MAX };

	//符合Attributes参数定义Roster之后，第二天最早签到时间。格式：HH:mm
	std::string _earliestBriefAfterRoster{};
    int _earliestBriefAfterRosterMinutes{};

	//符合Attributes参数定义Roster之前，前一天最晚签出时间。格式：HH:mm
	std::string _latestDebriefBeforeRoster{};
    int _latestDebriefBeforeRosterMinutes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchRosterAssignment(const ROSTER* roster) const;

	bool MatchRosterAssignmentGroup(const ROSTER* roster) const;

	bool MatchAttributes(const string& strAttribute) const;
public:

	bool MatchParam(const ROSTER* currRoster) const;

	bool MatchBeforeRosterAssignment(const ROSTER* beforeRoster) const;

	bool MatchBeforeRosterAssignmentGroup(const ROSTER* beforeRoster) const;

	bool MatchAfterRosterAssignment(const ROSTER* afterRoster) const;

	bool MatchAfterRosterAssignmentGroup(const ROSTER* afterRoster) const;
};

#endif //_CHECKEARLIESBRIEFORLATESTDEBRIEFAFTERROSTERFORPRRULEPARAM_H_
