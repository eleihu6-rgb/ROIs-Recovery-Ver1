#pragma once

#ifndef _CALCULATEMAXFLIGHTDUTYPERIODFORHXRULEPARAM_H_
#define _CALCULATEMAXFLIGHTDUTYPERIODFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMaxFlightDutyPeriodForHXRuleParam;

class CalculateMaxFlightDutyPeriodForHXRuleParam : public RuleParam {
	friend class CalculateMaxFlightDutyPeriodForHXRule;
private:
	explicit CalculateMaxFlightDutyPeriodForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7484;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 10;

	enum class ParamLocation {
		COMPOSITION = 0,
		RPT_START = 1,
		RPT_END = 2,
		DUTY_ASSIGNMENTS = 3,
		LANDING_LOWER = 4,
		LANDING_UPPER = 5,
		MAX_FDP = 6,
		PRECEDING_REST_RANGE = 7,
		SINGLE_FLY_SECTOR_BLH_RANGE = 8,
		REST_FACILITY = 9
	};

	//搭配，支持|分隔
	std::vector<std::string> _compositions{};
	//签到开始时间范围
	std::string _rptStart{};
	std::string _rptEnd{};

	//duty任务类型
	std::vector<std::string> _dutyAssignments{};

	//航段数
	int _landingLower{};
	int _landingUpper{};

	//最大FDP
	int _maxFdp{};

	// unkown状态下，睡眠机会范围
	std::string _precedingRestRange{};
	int _precedingRestLower = 0;
	int _precedingRestUpper = 0;

	//单个航班的飞时范围。格式：HH:mm-HH:mm，取值范围：[n,m]。支持*通配表示忽略
	std::string _singleFlySectorBlhRange{};
	int _singleFlySectorBlhRangeLower{};
	int _singleFlySectorBlhRangeUpper{};

	//休息设施
	std::string _restFacilityStr{};
	int _restFacility{ -1 };


	void ParseParam(const DBRule& dbRule);

	void parseRange(const std::string& rangeStr, int& lower, int& upper);

	bool MatchSingleFlySectorBlhRange(const Duty* duty) const;

	bool MatchRestFacility(const Duty* duty) const;
};

#endif //_CALCULATEMAXFLIGHTDUTYPERIODFORHXRULEPARAM_H_