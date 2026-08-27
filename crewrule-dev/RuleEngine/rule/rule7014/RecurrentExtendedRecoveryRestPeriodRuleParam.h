#pragma once

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class RecurrentExtendedRecoveryRestPeriodRuleParam;

class RecurrentExtendedRecoveryRestPeriodRuleParam : public RuleParam {
	friend class RecurrentExtendedRecoveryRestPeriodRule;
private:
	explicit RecurrentExtendedRecoveryRestPeriodRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7014;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 10;

	enum class ParamLocation {
		RERRP_MIN_REST,
		RERRP_NO_OF_LNS,
		MAX_SPAN_BETWEEN_RERRPS,
		RERRP_MIN_LOCAL_DAYS,
		RERRP_ASSIGNMENTS,
		IS_COUNT_BLANK_DAY,
		UNIT,
		PERIOD,
		MIN_RERRP_NUM
	};

	int _rerrpMinRest{};
	int _rerrpNoOfLns{};
	int _maxSpanBetweenRerrps{};
	int _rerrpMinLocalDays{};
	std::vector<std::string> _rerrpAssignments{};
	std::vector<std::string> _rerrpAssignmentGroups{};
	bool _isCountBlankDay{};
	std::string _unit{};
	int _period{};
	int _minRerrpNum{};


	void ParseParam(const DBRule& dbRule);

	bool IsRERRP(time_t startTime, time_t endTime) const;
	bool MatchMinLocalDays(time_t startTime, time_t endTime) const;

	bool DurationOfRerrps(time_t lastEndTime, time_t nextStartTime) const;

	bool MatchAssignment(const std::string& assignment) const;
};
