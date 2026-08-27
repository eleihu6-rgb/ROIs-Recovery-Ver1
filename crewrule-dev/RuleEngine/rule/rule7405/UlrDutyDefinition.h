#ifndef RULEENGINE_RULE7405_ULRDUTYDEFINITION_H_
#define RULEENGINE_RULE7405_ULRDUTYDEFINITION_H_

#include <functional>
#include <limits>
#include <string>
#include <vector>

#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"

/**
 * @brief Rule 7405 calculate rule for identifying ULR duties.
 *
 * Each row defines a set of filters (DEP, ARR, fleet, fleet group, effective
 * date, expiry date) that classify a duty as ULR when any operating segment
 * matches. This rule sets `Duty::isULR` so other rules can use `duty->isULR()`.
 */
class ULRDutyDefinition : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = 7405;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SinglePairing;

    explicit ULRDutyDefinition(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, ULRDutyDefinition::RuleFuncId, ULRDutyDefinition::AvailableInterface) {
        ParseParam(input);
    }
    ~ULRDutyDefinition() override = default;

    struct Row {
        long long idRule = 0;
        long long idRuleParam = 0;
        int rowNum = 0;
        std::string depStation;
        std::string arrStation;
        std::string fleet;
        std::string fleetGroup;
        std::string effectiveDate;
        std::string expiryDate;

        mutable bool utcRangeParsed = false;
        mutable bool utcRangeValid = true;
        mutable time_t effectiveStartUtc = 0;
        mutable time_t expiryEndUtc = std::numeric_limits<time_t>::max();
    };

    const std::vector<Row>& rows() const { return _rows; }
    bool empty() const { return _rows.empty(); }

    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(Duty* duty) override;

    bool isDutyULR(const Duty& duty) const;

    // Shared helpers for other rules:
    // - Parse effective/expiry date ranges into UTC.
    // - Match duties against rows, optionally requiring operating segments.
    static void ParseUtcRanges(std::vector<Row>& rows, const CrewDataContext* dbData);
    static bool DoesDutyMatchRows(const Duty& duty,
                                  const std::vector<Row>& rows,
                                  const CrewDataContext* dbData,
                                  bool requireOperatingSegment);
    static bool IsUlrEquivalentPositioningDuty(const Duty& duty,
                                               const std::vector<Row>& rows,
                                               const CrewDataContext* dbData);

    // Parse effective/expiry date ranges after `setDataContext()`.
    void ParseUtcRanges() const;

private:
    void ParseParam(const InputType& input);
    void parseRow(const DBRule& dbRule);

    //设置Pairing的P-URL标签
    void setURLAttributes(Pairing* pairing, const bool isPairingULR);

    static bool stationMatches(const std::string& ruleStation,
                               const std::string& station);
    static bool fleetMatches(const std::string& ruleFleet,
                             const std::string& fleet);
    static bool fleetGroupMatches(const std::string& ruleFleetGroup,
                                  const std::string& fleetGroup,
                                  const std::string& fleet);
    static bool parseUtcDateRange(const std::string& effectiveDate,
                                  const std::string& expiryDate,
                                  const std::string& depZoneId,
                                  time_t& startUtcOut,
                                  time_t& endUtcOut);
    static bool parseLocalDateTimeToUtc(const std::string& value,
                                        const std::string& depZoneId,
                                        bool endOfDay,
                                        time_t& utcOut);
    static std::string resolveFleetGroup(const std::string& fleetCodeUpper, const CrewDataContext* dbData);
    static std::string resolveZoneId(const std::string& depStationUpper, const CrewDataContext* dbData);
    static bool ParseUtcRange(Row& row, const CrewDataContext* dbData);

    mutable std::vector<Row> _rows;

};

#endif  // RULEENGINE_RULE7405_ULRDUTYDEFINITION_H_
