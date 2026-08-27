/**
 * @file TransitAndLayoverRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _TRANSITANDLAYOVERRULEPARAM_H_
#define _TRANSITANDLAYOVERRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "LimitLayoverParam.h"
#include "LimitAircraftChangeAndConnectionParam.h"

class LimitTransitAndLayoverRule;

class TransitAndLayoverRuleParam : public RuleParam {
	friend class LimitTransitAndLayoverRule;

public:


	vector<LimitLayoverParam>& GetLimitLayoverParams() const {
		return this->_limitLayoverParams;
	}

	void SetLimitLayoverParams(const vector<LimitLayoverParam>& limitLayoverParams) {
		this->_limitLayoverParams = limitLayoverParams;
	}

	vector<LimitAircraftChangeAndConnectionParam>& GetLimitAircraftChangeAndConnectionParams() const {
		return this->_limitAircraftChangeAndConnectionParams;
	}

	vector<LimitAircraftChangeAndConnectionParam> GetLimitAircraftChangeAndConnectionParams(const vector<std::string>& checkGroups);

	void SetLimitAircraftChangeAndConnectionParams(const vector<LimitAircraftChangeAndConnectionParam>& limitAircraftChangeAndConnectionParams) {
		this->_limitAircraftChangeAndConnectionParams = limitAircraftChangeAndConnectionParams;
	}

	bool Empty() const;

private:
	explicit TransitAndLayoverRuleParam(const Rule* rule) :RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 6019;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 2;

	mutable vector<LimitLayoverParam> _limitLayoverParams;
	mutable vector<LimitAircraftChangeAndConnectionParam> _limitAircraftChangeAndConnectionParams;

	//同组规则
	mutable multimap<std::string, LimitAircraftChangeAndConnectionParam> _mapLimitAircraftChangeAndConnectionParam;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	void PushCheckGroup(const LimitAircraftChangeAndConnectionParam &param);

};

#endif //_TRANSITANDLAYOVERRULEPARAM_H_
