/**
 * @file ExtraDaysOffAtBaseForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/

#ifndef _EXTRADAYSOFFATBASEFORSQRULEPARAM_H_
#define _EXTRADAYSOFFATBASEFORSQRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "../framework/utils/LocationMatchUtils.h"
#include <string>
#include <vector>

class CalculateExtraDaysOffAtBaseForSQRule;

enum class Exdo7466RestStartsAfter {
	Transport,
	Debrief,
	DebriefNxdo
};

struct Exdo7466ControlParam {
	bool standbyReducesRestAndLocalNight{true};
	Exdo7466RestStartsAfter restStartsAfter{Exdo7466RestStartsAfter::Transport};
	std::vector<std::string> standbyAssignmentsUpper{"SBY"};
	Exdo7466RestStartsAfter doStartsAfter{Exdo7466RestStartsAfter::Transport};
};

enum class Exdo7466SlipOperatingRequirement {
	Any,
	Operate,
	NonOperate
};

enum class Exdo7466FlightOperatingRequirement {
	Any,
	Operate,
	NonOperate
};

class ExtraDaysOffAtBaseForSQRuleParam : public RuleParam {
friend class CalculateExtraDaysOffAtBaseForSQRule;
public:
	int GetExtraDaysOff() const { return _extraDaysOff; }

private:
    explicit ExtraDaysOffAtBaseForSQRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7466;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		SLIP_STATION = 1,
		SLIP_ARR_IS_OPERATING = 2,
		SLIP_DEP_IS_OPERATING = 3,
		SLIP_LOCAL_NIGHT_RANGE = 4,
		COP_START_DOW = 5,
		FLIGHT_NUMBERS = 6,
		FLIGHT_IS_OPERATING = 7,
		PERIOD_START_DATE = 8,
		PERIOD_END_DATE = 9,
		EXTRA_DAYS_OFF = 10,
		SEVERITY = 11
    };

	using LocationExpr = LocationMatchUtils::LocationExpr;

	std::string _slipStationRaw{};
	LocationExpr _slipStation{};
	Exdo7466SlipOperatingRequirement _slipArrIsOperatingRequirement{Exdo7466SlipOperatingRequirement::Any};
	Exdo7466SlipOperatingRequirement _slipDepIsOperatingRequirement{Exdo7466SlipOperatingRequirement::Any};
	std::string _slipLocalNightRange{};
	int _slipLocalNightLower{};
	int _slipLocalNightUpper{};
	bool _hasSlipLocalNightRange{false};
	std::string _copStartDowRange{};
	int _copStartDowLower{};
	int _copStartDowUpper{};
	bool _hasCopStartDowRange{false};

	// Flight number list (without airline code); '|' separates multiple values; '*' supported.
	std::vector<std::string> _flightNumberPatternsUpper{};

	// Flight-number match assignment filter. '*' means any; 'Y' means operating only; 'N' means non-operating only.
	Exdo7466FlightOperatingRequirement _flightIsOperatingRequirement{Exdo7466FlightOperatingRequirement::Any};

	// Period start/end dates (base local time), format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.
	std::string _strPeriodStartDate{};
	time_t _periodStartDateLoc{};
	std::string _strPeriodEndDate{};
	std::time_t _periodEndDateLoc{};

	// Extra days off at base (integer days).
	int _extraDaysOff{};

	static Exdo7466SlipOperatingRequirement ParseSlipOperatingRequirement(const std::string& value);
	static Exdo7466FlightOperatingRequirement ParseFlightOperatingRequirement(const std::string& value);
	static bool ParseRange(const std::string& value, int& lower, int& upper);

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchCopStartDow(const Pairing* pairing) const;

	bool MatchFlightNumbers(const Pairing* pairing) const;

	bool MatchPeriod(const Pairing* pairing) const;

	bool MatchSlip(const Pairing* pairing,
	               const Exdo7466ControlParam& control,
	               const CrewDataContext* dbData) const;

private:
	bool MatchParam(const Pairing* pairing,
	                const Exdo7466ControlParam& control,
	                const CrewDataContext* dbData) const;
};

#endif //_EXTRADAYSOFFATBASEFORSQRULEPARAM_H_
