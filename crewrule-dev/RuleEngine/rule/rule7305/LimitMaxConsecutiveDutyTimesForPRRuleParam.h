/**
 * @file LimitMaxConsecutiveDutyTimesForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-07
**/

#ifndef _LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULEPARAM_H_
#define _LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitMaxConsecutiveDutyTimesForPRRule;

class LimitMaxConsecutiveDutyTimesForPRRuleParam : public RuleParam {
	friend class LimitMaxConsecutiveDutyTimesForPRRule;
private:
    explicit LimitMaxConsecutiveDutyTimesForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7305;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		POSITIONS = 3,
		FLEETS = 4,
		TEAMS = 5,
		ASSIGNMENT_GROUPS = 6,
		ASSIGNMENTS = 7,
		LABELS = 8,
		ATTRIBUTES = 9,
		CONSECUTIVE_TYPE = 12,
		MAX_CONSECUTIVE_TIMES = 14,
		SEVERITY = 15
    };

	//所属基地。多个值使用“|”分隔并支持*通配
	std::vector<string> _bases{};

	//人员级别。多个值使用“|”分隔并支持*通配
	std::vector<string> _ranks{};

	//人员子级别。多个值使用“|”分隔并支持*通配
	std::vector<string> _positions{};

	//人员机型。多个值使用“|”分隔并支持*通配
	std::vector<string> _fleets{};

	//团队。多个值使用“|”分隔并支持*通配
	std::vector<string> _teams{};

	//Roster任务类型组。多个值使用“|”分隔并支持*通配
	std::vector<string> _rosterAssignmentGroups{};

	//Roster的任务类型。多个值使用“|”分隔并支持*通配
	std::vector<string> _rosterAssignments{};

	//满足条件Roster对应Pairing标签Label。多个值使用“|”分隔并支持*通配
    string _strPairingLabels{};
	std::vector<string> _pairingLabels{};

	//满足条件Roster对应Pairing标签列表。多个值使用“|”分隔并支持*通配
	string _strPairingAttributes{};
	std::vector<string> _pairingAttributes{};

	//连续次数或天数类型。对Consecutive Times进行说明，取值：D-表示连续天数, T-表示连续次数。默认：T
	std::string _consecutiveType{};

	//最大连续次数。
	int _maxConsecutiveTimes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignments(const std::string& assignment) const;

	bool MatchAssignmentGroups(const std::string& assignment) const;

	bool MatchPairingAttributes(const ROSTER* roster) const;

	bool MatchPairingLabels(const ROSTER* roster) const;

public:
	//匹配参数
	bool MatchParam(const ROSTER* roster) const;
};

#endif //_LIMITMAXCONSECUTIVEDUTYTIMESFORPRRULEPARAM_H_
