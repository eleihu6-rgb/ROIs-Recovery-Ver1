/**
 * @file CalculateDutyTimeForDelayedFlightRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULEPARAM_H_
#define _CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateDutyTimeForDelayedFlightRule;

class CalculateDutyTimeForDelayedFlightRuleParam : public RuleParam {
	friend class CalculateDutyTimeForDelayedFlightRule;
private:
    explicit CalculateDutyTimeForDelayedFlightRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6022;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
        IS_HOME_BASE = 0,
        AMOUNT_OF_NOTIFICATION_RANGES = 1,
        AMOUNT_OF_DELAY_RANGES = 2,
        IS_USED_NEW_REPORTING_TIME = 3,
        ORIGINAL_REPORTING_TIME_DELTA = 4,
		SEVERITY = 5
    };

    //是否在基地,取值：Y/N。*表示未设置
    std::unique_ptr<bool> _isHomeBase{nullptr};
    //延误通知时间范围
    std::string _amountOfNotifyRanges{""};
    int _amountOfNotifyLower {0};
    int _amountOfNotifyUpper {0};

    //航班延误时间范围
    std::string _amountOfDelayRanges{ "" };
    int _amountOfDelayLower{ 0 };
    int _amountOfDelayUpper{ 0 };

    //是否使用新报告时间,取值：Y/N若是Y，则FDP开始时间使用新报告时间，此时originalReportingTimeDelta参数无效
    bool _isUsedNewReportingTime{false};
    //原报告时间差值(分钟数),格式：HH:MM。若是originalReportingTimeDelta为false，则FDP开始时间使用原报告时间+HH:MM
    std::string _strOriginalReportingTimeDelta{""};
    int _originalReportingTimeDelta {0};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足在基地条件
    bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//判断延误通知时间范围
	bool MatchAmountOfNotifyRanges(const Duty& duty) const;

    //判断航班延误时间范围
    bool MatchAmountOfDelayRanges(const Duty& duty) const;

public:
	bool MatchParam(const Duty& duty, const std::string& base) const;


};

#endif //_CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULEPARAM_H_
