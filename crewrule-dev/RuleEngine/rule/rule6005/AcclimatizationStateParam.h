/**
 * @file AcclimatizationStateParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _ACCLIMATIZATIONSTATEPARAM_H_
#define _ACCLIMATIZATIONSTATEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationRule;

class AcclimatizationStateParam : public RuleParam {
	friend class AcclimatizationRuleParam;

public:

	//适用状态,取值：A-适应状态，U-未知状态
	std::string GetAcclimatizationState() const {
		return _acclimatizationState;
	}

	//适应地点,取值：C-适应当前地点，L-适应上次已适应地点
	std::string GetAcclimatizationPort() const {
		return _acclimatizationPort;
	}
private:
    explicit AcclimatizationStateParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6005;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		TZ_DIFF = 0,
		TIME_SINCE_LAST_ACC = 1,
		ACC_STATE = 2,
		ACC_PORT = 3,
		SEVERITY = 4
    };

	//时差范围（分钟数范围）,格式：HH:mm-HH:mm.
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{0};
	int _timezoneDiffMinutesUpper{0};
	//新地点适用时长（分钟数）,格式：HH:mm-HH:mm
	//例如：00:00 - 999 : 00，表示0小时到999小时
	std::string _timeSinceLastAcc{};
	int _timeSinceLastAccMinutesLower{0};
	int _timeSinceLastAccMinutesUpper{0};
	//适用状态,取值：A-适应状态，U-未知状态
	mutable std::string _acclimatizationState{};
	//适应地点,取值：C-适应当前地点，L-适应上次已适应地点
	mutable std::string _acclimatizationPort{};



    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_ACCLIMATIZATIONSTATEPARAM_H_
