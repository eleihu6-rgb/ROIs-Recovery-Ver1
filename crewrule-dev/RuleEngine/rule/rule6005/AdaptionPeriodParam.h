/**
 * @file AdaptionPeriodParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _ADAPTIONPERIODPARAM_H_
#define _ADAPTIONPERIODPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationRule;

class AdaptionPeriodParam : public RuleParam {
	friend class AcclimatizationRuleParam;
private:
    explicit AdaptionPeriodParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6005;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		TZ_DIFF = 0,
		DIRECTION = 1,
		ADAPTION_PERIOD = 2,
		SEVERITY = 3
    };

	//时差范围（分钟数范围）,格式：HH:mm-HH:mm
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{0};
	int _timezoneDiffMinutesUpper{0};
	//飞行方向,取值：W-向西，E-向东
	std::string _direction{};
	//转化周期（分钟数）,格式：HH:mm
	//例如：120:00，表示时差120小时
	std::string _adaptionPeriod{"120:00"};
	int _adaptionPeriodMinutes{120*60};


    void ParseParam(const std::string& paramString);

public:
	void ParseParam(const DBRule& dbRule);
	
	//Added by Aspen on 2024.8.7 for rule 6038
	int get_timezoneDiffMinutesLower() const {
		return _timezoneDiffMinutesLower;
	}
	int get_timezoneDiffMinutesUpper() const {
		return _timezoneDiffMinutesUpper;
	}
	int get_adaptionPeriodMinutes() const {
		return _adaptionPeriodMinutes;
	}
	std::string get_direction() const {
		return _direction;
	}
	// This is function is for rule 6038 to generate one objecct becasue the constructer is private
	static AdaptionPeriodParam GetInstance(const Rule* rule) {
		return AdaptionPeriodParam(rule);
	}
};

#endif //_ADAPTIONPERIODPARAM_H_
