/**
 * @file CalculateFdpAndExtensionFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CalculateFdpAndExtensionFor5JRuleParam_H_
#define _CalculateFdpAndExtensionFor5JRuleParam_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateFdpAndExtensionFor5JRule;

class CalculateFdpAndExtensionFor5JRuleParam : public RuleParam {
	friend class CalculateFdpAndExtensionFor5JRule;
private:
	explicit CalculateFdpAndExtensionFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7317;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		COMPOSITION = 0,
		DUTY_FLEETS = 1,
		DUTY_TYPE = 2,
		DEPARTURE_RANGE = 3,
		RPT_RANGE = 4,
		LANDING_RANGE = 5,
		REST_FACILITY = 6,
		OVERRIDE_DUTY_ATTRIBUTES = 7,
		BLH_RANGE = 8,
		WOCL_OVERLAP_RANGE = 9,
		MAX_SECTORS = 10,
		MAX_FDP = 11,
		MAX_EXTENSION = 12,
		IS_AUGMENT = 13,
		IS_SPLIT = 14,
		ACC_STATES = 15,
		SINGLE_BLH_RANGE = 16
	};
	
	//配比
	std::string _compositionsStr{};
	std::vector<std::string> _compositions{};

	std::string _dutyFleetsStr{};
	std::vector<std::string> _dutyFleets{};

	std::string _dutyType{};

	std::string _departureRange{};
	int _departureStart{};
	int _departureEnd{};

	std::string _rptRange{};
	int _rptStart{};
	int _rptEnd{};

	std::string _landingRange{};
	int _landingLower{};
	int _landingUpper{};

	std::string _restFacilityStr{};
	int _restFacility{};

	std::string _dutyAttributesStr{};
	std::vector<std::string> _dutyAttributes{};

	//Duty中任一單一航班block hour的区间，格式：HH:mm-HH:mm，取值范围：[m,n)
	std::string _singleBlhRange{};
	std::vector<std::pair<int, int>> _singleBlhRangesMinutes{};

	std::string _blhRange{};
	int _blhRangeStart{};
	int _blhRangeEnd{};

	std::string _woclOverlapRange{};
	int _woclOverlapRangeStart{};
	int _woclOverlapRangeEnd{};

	std::string _maxSectorsStr{};
	int _maxSectors{};

	std::string _maxFDPStr{};
	int _maxFDP = 0;

	std::string _maxExtensionStr{};
	int _maxExtension = 0;

	bool _isAugment{};

	std::string _isSplitStr{};
	bool _isSplit{};

	string _accStatesStr{};
	std::vector<std::string> _accStates{};

	void ParseParam(const DBRule& dbRule);


public:

	bool MatchRuleParam(Duty* duty) const;

	bool MatchComposition(Duty* duty) const;

	bool MatchDutyFleet(const Duty* duty) const;

	bool MatchDutyType(const Duty* duty) const;

	bool MatchDepartureTime(const Duty* duty) const;

	bool MatchRptTime(const Duty* duty) const;

	bool MatchLandingNumber(const Duty* duty) const;

	bool MatchRestFacility(const Duty* duty) const;

	bool MatchDutyAttributes(const Duty* duty) const;

	bool MatchDutyBlhRange(const Duty* duty) const;

	bool MatchWoclOverlapRange(const Duty* duty) const;

	bool MatchMaxSectors(const Duty* duty) const;

	bool MatchSplitDuty(const Duty* duty) const;

	bool MatchAccStates(const Duty* duty) const;

	bool MatchBlhRange(const Duty* duty) const;
};

#endif //_CalculateFdpAndExtensionFor5JRuleParam_H_
