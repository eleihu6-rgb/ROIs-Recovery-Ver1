/**
 * @file CalculateAirportRestFaciltyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEAIRPORTRESTFACILTYRULEPARAM_H_
#define _CALCULATEAIRPORTRESTFACILTYRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateAirportRestFaciltyRule;

class CalculateAirportRestFaciltyRuleParam : public RuleParam {
	friend class CalculateAirportRestFaciltyRule;
private:
    explicit CalculateAirportRestFaciltyRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6006;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		AIRPORTS = 1,
		IS_SPLIT_DUTY = 2,
		TRANSIT_DURATION_RANGES = 3,
		AIRPORT_REST_FACILTY = 4,
		SEVERITY = 5
    };

	//任务环基地列表,支持*通配
	vector<std::string> _pairingBases{};
	//休息设施所属机场列表,支持*通配
	vector<std::string> _airports{};
	//是否Split Duty,支持*表示忽略
	std::unique_ptr<bool> _isSplitDuty{nullptr};
	//中转时间范围（分钟数）,格式：HH:mm-HH:mm
	std::string _transitDurationRanges{};
	int _transitDurationMinutesLower{};
	int _transitDurationMinutesUpper{};
	//休息设施等级,取值：S-Sleep睡眠设施、R-Rest休息设施，S等级高于R，即满足S肯定满足R
	std::string _airportRestFacilty{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Segment& segment, const std::string& base) const;

	//判断是否满足所在机场
	bool MatchAirports(const Segment& segment) const;

	//判断是否满足Split Duty条件
	bool MatchIsSplitDuty(const Segment& segment) const;

	//判断中转时间范围是否满足
	bool MatchTransitDuration(const Segment& currSegment, const Segment& nextSegment) const;

public:
	bool MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const;

};

#endif //_CALCULATEAIRPORTRESTFACILTYRULEPARAM_H_
