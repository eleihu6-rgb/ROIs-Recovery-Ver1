/**
 * @file MinScheDaysOffAtBaseForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/

#ifndef _MINSCHEDAYSOFFATBASEFORSQRULEPARAM_H_
#define _MINSCHEDAYSOFFATBASEFORSQRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>

class CalculateMinScheDaysOffAtBaseForSQRule;

class MinScheDaysOffAtBaseForSQRuleParam : public RuleParam {
friend class CalculateMinScheDaysOffAtBaseForSQRule;
public:
	bool DoStartsAfterDebrief() const { return _doStartsAfter != DoStartsAfter::Transport; }
	bool DoStartsAtExactMidnightNextDay() const { return _doStartsAfter == DoStartsAfter::DebriefNxdo; }
	bool PairingLengthEndsAtDebrief() const { return _pairingLengthEndsAt == PairingLengthEndsAt::Debrief; }

private:
    explicit MinScheDaysOffAtBaseForSQRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7465;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		COP_LENGTH_RANGE = 1,
		FLEETS = 2,
		SERVICE_TYPE = 3,
		DO_STARTS_AFTER = 4,
		MIN_DAYS_OFF = 5,
		PAIRING_LENGTH_ENDS_AT = 6,
		SEVERITY = 7
    };

	enum class DoStartsAfter {
		Transport,
		Debrief,
		DebriefNxdo
	};

	enum class PairingLengthEndsAt {
		Debrief,
		Transport
	};

	//Pairing长度范围（基地日历日，基地时区）。格式: n-m，取值范围:[n,m]
	std::string _pairingLengthRange{};
	int _pairingLengthLower{};
    int _pairingLengthUpper{};

	//航班机型列表。多个值使用“|”分隔并支持*通配
	vector<string> _flightFleets{};

	//航班的客货机标识。取值：J-客机，F-货机
	std::string _flightServiceType{};

	DoStartsAfter _doStartsAfter{DoStartsAfter::Transport};
	PairingLengthEndsAt _pairingLengthEndsAt{PairingLengthEndsAt::Debrief};

	//最小连续DO天数(基地时区)。
	int _minDaysOff{};

	static DoStartsAfter ParseDoStartsAfter(const std::string& value);
	static PairingLengthEndsAt ParsePairingLengthEndsAt(const std::string& value);

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchPairingLength(const Pairing* pairing) const;

	bool MatchFlightFleetAndServiceType(const Pairing* pairing) const;

private:
	bool MatchParam(const Pairing* pairing) const;


};

#endif //_MINSCHEDAYSOFFATBASEFORSQRULEPARAM_H_
