/**
 * @file AdaptionPeriodRuleParam.h
 * @brief
 * @author aspen.sang
 * @email yang.sang@pi-solution.com
 * @version 1.0
 * @date 2024-08-06
**/

#ifndef _ADAPTIONPERIODRULE4MAXFDPPARAM_H_
#define _ADAPTIONPERIODRULE4MAXFDPPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class AdaptionPeriod4MaxFDPRule;

class AdaptionPeriod4MaxFDPRuleParam : public RuleParam {
	friend class AdaptionPeriod4MaxFDPRule;
private:
	explicit AdaptionPeriod4MaxFDPRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6038;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		MAX_CONSECUTIVE_DUTIES = 0,
		MAX_UNKNOW_STATES_OF_ACC = 1
	};

	// 一个Pairing中允许的最大连续Duty数量
	int _maxConsecutiveDuties{0};
	//一个Pairing中允许的最大未知（U）的适应状态数量
	int _maxUnknownStatesOfACC {0};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);
public:
	int GetMaxConsecutiveDuties() const {
		return this->_maxConsecutiveDuties;
	}

	int GetMaxUnknownStatesOfACC() const{
		return this->_maxUnknownStatesOfACC;
	}
};

#endif //_ADAPTIONPERIODRULE4MAXFDPPARAM_H_
