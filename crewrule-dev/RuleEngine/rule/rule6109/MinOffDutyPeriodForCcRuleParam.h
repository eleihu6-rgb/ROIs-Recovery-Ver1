/**
 * @file MinOffDutyPeriodForCcRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MINOFFDUTYPERIODFORCCRULEPARAM_H_
#define _MINOFFDUTYPERIODFORCCRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class MinOffDutyPeriodForCcRule;

class MinOffDutyPeriodForCcRuleParam : public RuleParam {
friend class MinOffDutyPeriodForCcRule;
private:
    explicit MinOffDutyPeriodForCcRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6109;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    // Composition, Rpt Start, Rpt End, Max BLH, IsAugment
    enum class ParamLocation {
		PREV_DP = 0,
		MAX_REF_REST_DP = 1,
		FACTOR_DP = 2,
		IS_SPLIT_DUTY = 3,
		SPLIT_DUTY_LIMIT_START_TIME = 4,
		SPLIT_DUTY_LIMIT_END_TIME = 5,
		SPLIT_DUTY_MIN_REF_REST = 6,
		SPLIT_REST_PERIOD_DISCOUNT_FACTOR = 7,
		SEVERITY = 8
    };

	//前一个执勤期（分钟数）,格式：HH:mm。12 hours，表示为12:00
	std::string _prevDP{};
	int _prevDPMinutes{};
	//执勤期最大参照休息时间（分钟数）,格式：HH:mm。10 hours，表示为10:00
	std::string _maxRefRestDP{};
	int _maxRefRestDPMinutes{};
	//执勤期倍数
	double _factorDP{};
	//长过站执勤期限制开始时间（时分）,例如：23:00
	std::string _splitDutyLimitStartTime{};
	int _splitDutyLimitStartTimeMinutes{};
	//长过站执勤期限制结束时间（时分）,例如：05:00。
	//splitDutyLimitEndTime小于splitDutyLimitStartTime，则表示跨夜
	std::string _splitDutyLimitEndTime{};
	int _splitDutyLimitEndTimeMinutes{};
	//长过站执勤期最小时长参考值（分钟数）
	unsigned int _splitDutyMinRefRest{};
	//长过站执勤期折扣因数
	double _splitRestPeriodDiscountFactor{};

    void ParseParam(const std::string& paramString);
    //bool MatchParam(const std::string& composition, const long& reportTime, bool isAugment) const;

	void ParseParam(const DBRule& dbRule);
};

#endif //_MINOFFDUTYPERIODFORCCRULEPARAM_H_
