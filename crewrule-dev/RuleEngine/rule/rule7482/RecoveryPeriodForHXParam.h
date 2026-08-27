/**
 * @file RecoveryPeriodForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/

#ifndef _RECOVERYPERIODFORHXPARAM_H_
#define _RECOVERYPERIODFORHXPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class AcclimatizationRule;
class LimitTaskOnRecoveryPeriodForHXRule;

class RecoveryPeriodForHXParam : public RuleParam {
	friend class AcclimatizationForHXRuleParam;
	friend class AcclimatizationForHXRule;
	friend class LimitTaskOnRecoveryPeriodForHXRule;
private:
    explicit RecoveryPeriodForHXParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7482;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
		TZ_DIFF = 1,
		DUTY_CYCLE_IN_UNACCLIMATIZED_STATE = 2,
		IS_RECOVERY_LOCATION_AT_BASE = 3,
		TZ_DIFF_BETWEEN_RECOVERY_LOCATION_AND_BASE = 4,
		MIN_DO = 5,
		MIN_CONSECUTIVE_LOCAL_NIGHT_TIMES = 6,
		ACC_STATE = 7,//隐藏参数，默认为A
		SEVERITY = 8
    };

	//时差范围（分钟数范围）,格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{0};
	int _timezoneDiffMinutesUpper{0};

	//未适应状态的执勤周期时长范围,格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	std::string _dutyCycleInUnaccState{};
	int _dutyCycleInUnaccStateMinutesLower{ 0 };
	int _dutyCycleInUnaccStateMinutesUpper{ 0 };

	//恢复到适应状态的地点是否需要在Base,取值：Y/N。*表示未设置
	shared_ptr<bool> _isRecoveryLocationBase{nullptr};

	//恢复地点与base的时区差范围,格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)
	std::string _tzDiffBetweenRecoveryLocAndBase{};
	int _tzDiffBetweenRecoveryLocAndBaseMinutesLower{ 0 };
	int _tzDiffBetweenRecoveryLocAndBaseMinutesUpper{ 0 };

	//最小恢复DDO数量(恢复周期)。从不适应状态恢复到适应状态的DDO数量
	shared_ptr<int> _minDO{ nullptr };

	//最小连续本地夜晚次数(恢复周期)。从不适应状态恢复到适应状态的连续本地夜晚数量
	shared_ptr<int> _minConsecutiveLocalNightTimes{ nullptr };

	//适用状态,取值：A-适应状态，U-未知状态。隐藏参数，默认为A
	std::string _acclimatizationState{"A"};

    void ParseParam(const std::string& paramString);

public:
	void ParseParam(const DBRule& dbRule);
	
	static RecoveryPeriodForHXParam GetInstance(const Rule* rule) {
		return RecoveryPeriodForHXParam(rule);
	}

	//判断是否匹配时区差
	bool MatchTimezoneDiff(const int tzDiffMinutes) const;

	//判断是否匹配未适应状态的执勤周期时长范围
	bool MatchDutyCycleInUnacclimatizedState(const int dutyCycleInUnacclimatizedState) const;

	bool IsRecoveryLocationBase(const Duty* currDuty, const string& pairingBase) const;

	//判断是否匹配恢复地点与base的时区差范围
	bool MatchTzDiffBetweenRecoveryLocAndBase(const int tzDiffMinutes) const;
};

#endif //_RECOVERYPERIODFORHXPARAM_H_
