#pragma once
#ifndef _CALCULATEMANDAYFTCUSTOMRULEPARAM_H_
#define _CALCULATEMANDAYFTCUSTOMRULEPARAM_H_
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMandayFTCustomRuleParam;

class CalculateMandayFTCustomRuleParam : public RuleParam {
	friend class CalculateMandayFTCustomRule;
private:
	explicit CalculateMandayFTCustomRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7006;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		DIVISION = 0,
		FLIGHT_TIME_START = 1,
		FLIGHT_TIME_END = 2,
		COMPOSITION = 3,
		ASSIGNMENTS = 4,
		PERCENT = 5

	};

	//部门
	string _division{};
	//航班飞时开始范围
	int _flightTimeStart{};
	//航班飞时结束范围
	int _flightTimeEnd{};
	//配比
	string _composition{};
	//任务类型
	vector<string> _assignments{};
	//百分比
	double _percent{};

	void ParseParam(const DBRule& dbRule);

};
#endif
