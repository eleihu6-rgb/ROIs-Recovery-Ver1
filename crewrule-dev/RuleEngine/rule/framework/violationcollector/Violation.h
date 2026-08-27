/**
 * @file RuleViolation.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-17
**/


#ifndef NEWRULEENGINE_VIOLATION_H
#define NEWRULEENGINE_VIOLATION_H

#include <string>
#include <memory>
#include "RuleSystemDefine.h"
#include "ViolationTypeDefine.h"
#include "spdlog/spdlog.h"

class ViolationCollector;

class Violation {
friend class ViolationCollector;
public:

    ~Violation() = default;
    Violation(Violation&) = delete; // copy constructor is not allow, all Violations are managed by ViolationCollector


    inline void SetTimeWindow(time_t startTimeUTC, time_t endTimeUTC) {
        if (startTimeUTC > endTimeUTC) {
            spdlog::warn("Violation of Type:{0:>1}, Severity:{}, RuleFuncId: {1:>5} time windows conflict, startTime: {2:>16}, endTime: {3:>16}, mismatch: {4:>16}",
                         enum_to_underlying(_type), enum_to_underlying(_severity), _ruleFuncId, startTimeUTC, endTimeUTC, (int)endTimeUTC - startTimeUTC);
        }
        _startTimeUTC = startTimeUTC;
        _endTimeUTC = endTimeUTC;
    };

    inline void SetViolation(const std::string& violation) { _violation = violation; }

    // Violation related entity ptr, modify its content is not allow in Violation class access, extend as necessary
    inline const Pairing* GetPairing() const {return _pairing;}
    inline void SetPairing(const Pairing* pairing) { pairing = _pairing; }

    inline const Duty *GetDuty() const { return _duty; }
    inline void SetDuty(const Duty *duty) { _duty = duty; }

    inline const Segment *GetSegment() const { return _segment; }
    inline void SetSegment(const Segment *segment) { _segment = segment; }

    inline const CREW *GetCrew() const { return _crew; }
    inline void SetCrew(const CREW *crew) { _crew = crew; }

    inline const ROSTER *GetRoster() const { return _roster; }
    inline void SetRoster(const ROSTER *roster) { _roster = roster; }

    // Output methods, fine format should be done at formatter class
    inline ViolationType GetType() const { return _type; }
    inline unsigned int GetRuleFuncId() const { return _ruleFuncId; }
    inline time_t GetStartTimeUtc() const { return _startTimeUTC; }
    inline time_t GetEndTimeUtc() const { return _endTimeUTC; }
    inline const std::string &GetViolation() const { return _violation; }
    inline ViolationSeverity GetSeverity() const { return _severity; }


private:
    // private constructors only accessible in ViolationCollector class (create and move)
    explicit Violation(const ViolationType& type, const ViolationSeverity& severity, const unsigned int& ruleFuncId): _type(type), _severity(severity), _ruleFuncId(ruleFuncId) {}
    Violation(Violation&&) = default;

    ViolationType _type;
    ViolationSeverity _severity;
    unsigned int _ruleFuncId;
	time_t _startTimeUTC{0};
	time_t _endTimeUTC{0};
    const Pairing* _pairing{nullptr};
    const Duty* _duty{nullptr};
    const Segment* _segment{nullptr};
    const CREW* _crew{nullptr};
    const ROSTER* _roster{nullptr};

    std::string _violation;

};

#endif //NEWRULEENGINE_VIOLATION_H
