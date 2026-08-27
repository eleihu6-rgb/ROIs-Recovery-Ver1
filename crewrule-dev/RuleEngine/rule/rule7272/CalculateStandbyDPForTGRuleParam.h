/**
 * @file CalculateStandbyDPForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CalculateStandbyDPForTGRuleParam_H_
#define _CalculateStandbyDPForTGRuleParam_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateStandbyDPForTGRule;

class CalculateStandbyDPForTGRuleParam : public RuleParam {
	friend class CalculateStandbyDPForTGRule;
private:
	explicit CalculateStandbyDPForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7272;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		ASSIGNMENTS,
		ADJUST_DP,
		PCT,
	};

	std::vector<std::string> _assignments{};

	int _offset{};

	int _sbyLimit{};

	int _notifyLimit{};

	double _rate{};

	void ParseParam(const DBRule& dbRule);


public:


};

#endif //_CalculateStandbyDPForTGRuleParam_H_
