/**
 * @file CheckDisruptiveSchedulesLocalNightForTGRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULEPARAM_H_
#define _CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckDisruptiveSchedulesLocalNightForTGRule;

class CheckDisruptiveSchedulesLocalNightForTGRuleParam : public RuleParam {
	friend class CheckDisruptiveSchedulesLocalNightForTGRule;
private:
	explicit CheckDisruptiveSchedulesLocalNightForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7276;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		DUTY_A_ASSIGNMENTS = 1,
		DUTY_B_ASSIGNMENTS = 2,
		DUTY_A_TYPES = 3,
		DUTY_B_TYPES = 4,
		IS_DUTY_A_HOME_BASE = 5,
		IS_DUTY_B_HOME_BASE = 6,
		MIN_LOCAL_NIGHT = 7
	};

	std::vector<std::string> _dutyAAssignments{};

	std::vector<std::string> _dutyBAssignments{};

	std::vector<std::string> _dutyATypes{};

	std::vector<std::string> _dutyBTypes{};

	std::unique_ptr<bool> _isDutyAHomeBase{};

	std::unique_ptr<bool>_isDutyBHomeBase{};

	int _minLocalNight;

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchAssignments(const string dutyAAssignment, const string dutyBAssignment) const;

	bool MatchDutyATypes(const Duty* dutyA) const;
	bool MatchDutyBTypes(const Duty* dutyB) const;

	bool MatchAHomeBase(const Duty* duty, const string base) const;
	bool MatchBHomeBase(const Duty* duty, const string base) const;
};

#endif //_CHECKDISRUPTIVESCHEDULESLOCALNIGHTFORTGRULEPARAM_H_
