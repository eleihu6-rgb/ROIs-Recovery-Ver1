/**
 * @file CheckDaysOffForTradeRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKDAYSOFFFORTRADERULEPARAM_H_
#define _CHECKDAYSOFFFORTRADERULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckDaysOffForTradeRule;

class CheckDaysOffForTradeRuleParam : public RuleParam {
	friend class CheckDaysOffForTradeRule;
private:
	explicit CheckDaysOffForTradeRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7275;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		DO_ASSIGNMENT_GROUPS = 5,
		MIN_DO = 6,
		UTILIZE_POST_DUTY_REST = 7,
		COUNT_BLANK_DAY = 8,
		COUNT_LAYOVER = 9,
		LAYOVER_TIMEMODE = 10,
		START_MONTH = 11,
		END_MONTH = 12
	};

	std::vector<std::string> _ranks{};
	std::vector<std::string> _bases{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	std::vector<std::string> _doAssignmentGroups{};
	int _minDO{};
	bool _utilizePostDutyRest{};
	bool _countBlankDay{};
	bool _countLayover{};
	std::string _layoverTimemode{};
	int _startMonth{};
	int _endMonth{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	int GetDaysOffByRosters(const std::vector<const ROSTER*>& rosters) const;

	int GetDaysOffByMandayFD(const vector<std::shared_ptr<CREW_MANDAY_FD>>& manday, const time_t& countStart, const time_t& countEnd, const time_t& exceptStart, const time_t& exceptEnd) const;

	int GetDaysOffByMandayCC(const vector<std::shared_ptr<CREW_MANDAY_CC_AM>>& manday, const time_t& countStart, const time_t& countEnd, const time_t& exceptStart, const time_t& exceptEnd) const;
};

#endif //_CHECKDAYSOFFFORTRADERULEPARAM_H_
