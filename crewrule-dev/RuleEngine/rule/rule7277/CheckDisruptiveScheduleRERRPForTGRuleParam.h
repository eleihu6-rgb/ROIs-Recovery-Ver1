/**
 * @file CheckDisruptiveScheduleRERRPForTGRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKDISRUPTIVESCHEDULERERRPFORTGRULEPARAM_H_
#define _CHECKDISRUPTIVESCHEDULERERRPFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckDisruptiveScheduleRERRPForTGRule;

class CheckDisruptiveScheduleRERRPForTGRuleParam : public RuleParam {
	friend class CheckDisruptiveScheduleRERRPForTGRule;
private:
	explicit CheckDisruptiveScheduleRERRPForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7277;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		ASSIGNMENTS = 1,
		TYPES = 2,
		DUTY_NUMBER_RANGE = 3,
		NEXT_RERRP_MIN_REST = 4
	};

	std::vector<std::string> _assignments{};

	std::vector<std::string> _types{};

	std::vector<std::string> _dutyNumberRange{};
	int _dutyNumberLowwer = -1;
	int _dutyNumberUpper = -1;

	int _nextRERRPMinRest;

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchAssignments(const string assignment) const;

	bool MatchDutyTypes(const time_t checkStartUtc, const time_t checkEndUtc, const int ref) const;

	bool MatchDutyNumberRange(const int count) const;

};

#endif //_CHECKDISRUPTIVESCHEDULERERRPFORTGRULEPARAM_H_
