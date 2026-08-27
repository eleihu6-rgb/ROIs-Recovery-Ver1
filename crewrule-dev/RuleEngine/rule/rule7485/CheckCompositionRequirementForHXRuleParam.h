#pragma once

#ifndef _CHECKCOMPOSITIONREQUIREMENTFORHXRULEPARAM_H_
#define _CHECKCOMPOSITIONREQUIREMENTFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckCompositionRequirementForHXRuleParam;

class CheckCompositionRequirementForHXRuleParam : public RuleParam {
	friend class CheckCompositionRequirementForHXRule;
private:
	explicit CheckCompositionRequirementForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7485;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 11;

	enum class ParamLocation {
		COMPOSITION = 0,
		RPT_START = 1,
		RPT_END = 2,
		DUTY_ASSIGNMENTS = 3,
		LANDING_LOWER = 4,
		LANDING_UPPER = 5,
		DUTY_BLH_RANGE = 6,
		SCH_FLT_WINDOW_RANGE = 7,
		SECTOR_BLH_RANGE = 8,
		MAX_FDP = 9,
		PRECEDING_REST_RANGE = 10
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

	//duty飞时
	std::string _dutyBlhRange{};
	int _dutyBlhLower{};
	int _dutyBlhUpper{};

	std::string _schFltWindowRange{};
	int _schFltWindowLower{};
	int _schFltWindowUpper{};

	std::string _sectorBlhRange{};
	int _sectorBlhLower{};
	int _sectorBlhUpper{};

	std::string _compositionRequirement{};

	// unkown状态下，睡眠机会范围
	std::string _precedingRestRange{};
	int _precedingRestLower = 0;
	int _precedingRestUpper = 0;


	void ParseParam(const DBRule& dbRule);

	void parseRange(const string& rangeStr, int& lower, int& upper);
};

#endif //_CHECKCOMPOSITIONREQUIREMENTFORHXRULEPARAM_H_