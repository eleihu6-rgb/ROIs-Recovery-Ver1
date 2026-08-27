#pragma once
#ifndef _MINRESTRULEPARAM_H_
#define _MINRESTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MinRestRule;

class MinRestRuleParam : public RuleParam {
	friend class CheckMinRestRule;
private:
	explicit MinRestRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7007;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		BASES,
		RANKS,
		FLEETS,
		TEAMS,
		PERIOD,
		UNIT,
		MIN_LOCAL_DAY_FREE,
		DAYSOFF_ASSIGNMENTS,
		DAYSOFF_ASSIGNMENT_GROUPS,
		UTILIZE_POST_DUTY_REST,
		COUNT_BLANK_DAY
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	int _period{};
	string _unit{};
	int _minLocalDayFree{};
	vector<string> _daysOffAssignments{};
	vector<string> _daysOffAssignmentGroups{};
	bool _utilizePostDutyRest{};
	bool _countBlankDay{};

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

};

#endif //_MINRESTRULEPARAM_H_
