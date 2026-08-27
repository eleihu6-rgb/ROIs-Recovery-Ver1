//
// Created by haoli on 2025/7/4.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGDATAHOLDER_H
#define TRAININGOPTIMIZER_DBTRAININGDATAHOLDER_H

#include "vector"
#include "memory"

#include "DBTrainingCourse.h"
#include "DBTrainingCourseDeviceRequirement.h"
#include "DBTrainingCourseDeviceRequirementAttendant.h"
#include "DBTrainingCourseDeviceRequirementSlot.h"
#include "DBTrainingCourseGrantQualification.h"
#include "DBTrainingCoursePairingRequirement.h"
#include "DBTrainingCourseRoleRequirement.h"
#include "DBTrainingCourseRole.h"
#include "DBTrainingDevice.h"
#include "DBTrainingDeviceOccupiedTime.h"
#include "DBTrainingPairingSeparationComplement.h"
#include "DBTrainingPairingSeparationRequirement.h"
#include "DBTrainingPairingSeparationRoster.h"
#include "DBTrainingProgram.h"
#include "DBTrainingProgramCourse.h"
#include "DBTrainingProgramCourseDependency.h"
#include "DBTrainingProgramCourseParticipant.h"
#include "DBTrainingProgramCourseInstructorParticipant.h"
#include "DBTrainingPairingChangeRecord.h"
#include "DBTrainingPairingChart.h"
#include "DBTrainingCourseTime.h"
#include "DBTrainingFootprintCourse.h"
#include "DBTrainingFootprintCourseTrainee.h"
#include "DBTrainingFootprintCourseSector.h"
#include "DBTrainingFootprint.h"
#include "DBTrainingFootprintCourseIpRole.h"
#include "DBTrainingFootprintCourseRole.h"
#include "DBTrainingProgramCourseIpRole.h"
#include "DBTrainingProgramCourseRole.h"

class DBTrainingDataHolder {
public:

    explicit DBTrainingDataHolder() = default;
    ~DBTrainingDataHolder() = default;

    DBTrainingCourse *GetDBTrainingCourse(size_t loc) {
        if (_dbTrainingCourses.size() > loc) return _dbTrainingCourses.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourse *> GetDBTrainingCourses() {
        std::vector<DBTrainingCourse *> result;
        result.reserve(_dbTrainingCourses.size());
        for (auto &item: _dbTrainingCourses) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourse(std::unique_ptr<DBTrainingCourse> &item) {
        _dbTrainingCourseLocation[item->GetId()] = _dbTrainingCourses.size();
        _dbTrainingCourses.emplace_back(std::move(item));
    }

    DBTrainingCourseDeviceRequirement *GetDBTrainingCourseDeviceRequirement(size_t loc) {
        if (_dbTrainingCourseDeviceRequirements.size() > loc) return _dbTrainingCourseDeviceRequirements.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourseDeviceRequirement *> GetDBTrainingCourseDeviceRequirements() {
        std::vector<DBTrainingCourseDeviceRequirement *> result;
        result.reserve(_dbTrainingCourseDeviceRequirements.size());
        for (auto &item: _dbTrainingCourseDeviceRequirements) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseDeviceRequirement(std::unique_ptr<DBTrainingCourseDeviceRequirement> &item) {
        _dbTrainingCourseDeviceRequirementLocation[item->GetId()] = _dbTrainingCourseDeviceRequirements.size();
        _dbTrainingCourseDeviceRequirements.emplace_back(std::move(item));
    }

    DBTrainingCourseDeviceRequirementAttendant *GetDBTrainingCourseDeviceRequirementAttendant(size_t loc) {
        if (_dbTrainingCourseDeviceRequirementAttendants.size() > loc) return _dbTrainingCourseDeviceRequirementAttendants.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingCourseDeviceRequirementAttendant *> GetDBTrainingCourseDeviceRequirementAttendants() {
        std::vector<DBTrainingCourseDeviceRequirementAttendant *> result;
        result.reserve(_dbTrainingCourseDeviceRequirementAttendants.size());
        for (auto &item: _dbTrainingCourseDeviceRequirementAttendants) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void
    PushDBTrainingCourseDeviceRequirementAttendant(std::unique_ptr<DBTrainingCourseDeviceRequirementAttendant> &item) {
        _dbTrainingCourseDeviceRequirementAttendants.emplace_back(std::move(item));
    }

    DBTrainingCourseDeviceRequirementSlot *GetDBTrainingCourseDeviceRequirementSlot(size_t loc) {
        if (_dbTrainingCourseDeviceRequirementSlots.size() > loc) return _dbTrainingCourseDeviceRequirementSlots.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourseDeviceRequirementSlot *> GetDBTrainingCourseDeviceRequirementSlots() {
        std::vector<DBTrainingCourseDeviceRequirementSlot *> result;
        result.reserve(_dbTrainingCourseDeviceRequirementSlots.size());
        for (auto &item: _dbTrainingCourseDeviceRequirementSlots) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseDeviceRequirementSlot(std::unique_ptr<DBTrainingCourseDeviceRequirementSlot> &item) {
        _dbTrainingCourseDeviceRequirementSlotLocation[item->GetDeviceRequirementId()] = _dbTrainingCourseDeviceRequirementSlots.size();
        _dbTrainingCourseDeviceRequirementSlots.emplace_back(std::move(item));
    }

    DBTrainingCourseGrantQualification *GetDBTrainingCourseGrantQualification(size_t loc) {
        if (_dbTrainingCourseGrantQualifications.size() > loc) return _dbTrainingCourseGrantQualifications.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourseGrantQualification *> GetDBTrainingCourseGrantQualifications() {
        std::vector<DBTrainingCourseGrantQualification *> result;
        result.reserve(_dbTrainingCourseGrantQualifications.size());
        for (auto &item: _dbTrainingCourseGrantQualifications) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseGrantQualification(std::unique_ptr<DBTrainingCourseGrantQualification> &item) {
        _dbTrainingCourseGrantQualifications.emplace_back(std::move(item));
    }

    DBTrainingCoursePairingRequirement *GetDBTrainingCoursePairingRequirement(size_t loc) {
        if (_dbTrainingCoursePairingRequirements.size() > loc) return _dbTrainingCoursePairingRequirements.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCoursePairingRequirement *> GetDBTrainingCoursePairingRequirements() {
        std::vector<DBTrainingCoursePairingRequirement *> result;
        result.reserve(_dbTrainingCoursePairingRequirements.size());
        for (auto &item: _dbTrainingCoursePairingRequirements) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCoursePairingRequirement(std::unique_ptr<DBTrainingCoursePairingRequirement> &item) {
        _dbTrainingCoursePairingRequirements.emplace_back(std::move(item));
    }

    DBTrainingCourseRoleRequirement *GetDBTrainingCourseRoleRequirement(size_t loc) {
        if (_dbTrainingCourseRoleRequirements.size() > loc) return _dbTrainingCourseRoleRequirements.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourseRoleRequirement *> GetDBTrainingCourseRoleRequirements() {
        std::vector<DBTrainingCourseRoleRequirement *> result;
        result.reserve(_dbTrainingCourseRoleRequirements.size());
        for (auto &item: _dbTrainingCourseRoleRequirements) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseRoleRequirement(std::unique_ptr<DBTrainingCourseRoleRequirement> &item) {
        _dbTrainingCourseRoleRequirements.emplace_back(std::move(item));
    }

    DBTrainingCourseRole *GetDBTrainingCourseRole(size_t loc) {
        if (_dbTrainingCourseRoles.size() > loc) return _dbTrainingCourseRoles.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingCourseRole *> GetDBTrainingCourseRoles() {
        std::vector<DBTrainingCourseRole *> result;
        result.reserve(_dbTrainingCourseRoles.size());
        for (auto &item: _dbTrainingCourseRoles) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseRole(std::unique_ptr<DBTrainingCourseRole> &item) {
        _dbTrainingCourseRoles.emplace_back(std::move(item));
    }

    DBTrainingDevice *GetDBTrainingDevice(size_t loc) {
        if (_dbTrainingDevices.size() > loc) return _dbTrainingDevices.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingDevice *> GetDBTrainingDevices() {
        std::vector<DBTrainingDevice *> result;
        result.reserve(_dbTrainingDevices.size());
        for (auto &item: _dbTrainingDevices) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingDevice(std::unique_ptr<DBTrainingDevice> &item) {
        _dbTrainingDeviceLocation[item->GetId()] = _dbTrainingDevices.size();
        _dbTrainingDevices.emplace_back(std::move(item));
    }

    DBTrainingDeviceOccupiedTime *GetDBTrainingDeviceOccupiedTime(size_t loc) {
        if (_dbTrainingDeviceOccupiedTimes.size() > loc) return _dbTrainingDeviceOccupiedTimes.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingDeviceOccupiedTime *> GetDBTrainingDeviceOccupiedTimes() {
        std::vector<DBTrainingDeviceOccupiedTime *> result;
        result.reserve(_dbTrainingDeviceOccupiedTimes.size());
        for (auto &item: _dbTrainingDeviceOccupiedTimes) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingDeviceOccupiedTime(std::unique_ptr<DBTrainingDeviceOccupiedTime> &item) {
        _dbTrainingDeviceOccupiedTimes.emplace_back(std::move(item));
    }

    DBTrainingPairingSeparationComplement *GetDBTrainingPairingSeparationComplement(size_t loc) {
        if (_dbTrainingPairingSeparationComplements.size() > loc) return _dbTrainingPairingSeparationComplements.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingPairingSeparationComplement *> GetDBTrainingPairingSeparationComplements() {
        std::vector<DBTrainingPairingSeparationComplement *> result;
        result.reserve(_dbTrainingPairingSeparationComplements.size());
        for (auto &item: _dbTrainingPairingSeparationComplements) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingPairingSeparationComplement(std::unique_ptr<DBTrainingPairingSeparationComplement> &item) {
        _dbTrainingPairingSeparationComplements.emplace_back(std::move(item));
    }

    DBTrainingPairingSeparationRequirement *GetDBTrainingPairingSeparationRequirement(size_t loc) {
        if (_dbTrainingPairingSeparationRequirements.size() > loc) return _dbTrainingPairingSeparationRequirements.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingPairingSeparationRequirement *> GetDBTrainingPairingSeparationRequirements() {
        std::vector<DBTrainingPairingSeparationRequirement *> result;
        result.reserve(_dbTrainingPairingSeparationRequirements.size());
        for (auto &item: _dbTrainingPairingSeparationRequirements) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingPairingSeparationRequirement(std::unique_ptr<DBTrainingPairingSeparationRequirement> &item) {
        _dbTrainingPairingSeparationRequirementLocation[item->GetId()] = _dbTrainingPairingSeparationRequirements.size();
        _dbTrainingPairingSeparationRequirements.emplace_back(std::move(item));
    }

    DBTrainingPairingSeparationRoster *GetDBTrainingPairingSeparationRoster(size_t loc) {
        if (_dbTrainingPairingSeparationRosters.size() > loc) return _dbTrainingPairingSeparationRosters.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingPairingSeparationRoster *> GetDBTrainingPairingSeparationRosters() {
        std::vector<DBTrainingPairingSeparationRoster *> result;
        result.reserve(_dbTrainingPairingSeparationRosters.size());
        for (auto &item: _dbTrainingPairingSeparationRosters) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingPairingSeparationRoster(std::unique_ptr<DBTrainingPairingSeparationRoster> &item) {
        _dbTrainingPairingSeparationRosters.emplace_back(std::move(item));
    }

    DBTrainingProgram *GetDBTrainingProgram(size_t loc) {
        if (_dbTrainingPrograms.size() > loc) return _dbTrainingPrograms.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingProgram *> GetDBTrainingPrograms() {
        std::vector<DBTrainingProgram *> result;
        result.reserve(_dbTrainingPrograms.size());
        for (auto &item: _dbTrainingPrograms) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgram(std::unique_ptr<DBTrainingProgram> &item) {
        _dbTrainingPrograms.emplace_back(std::move(item));
    }

    DBTrainingProgramCourse *GetDBTrainingProgramCourse(size_t loc) {
        if (_dbTrainingProgramCourses.size() > loc) return _dbTrainingProgramCourses.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingProgramCourse *> GetDBTrainingProgramCourses() {
        std::vector<DBTrainingProgramCourse *> result;
        result.reserve(_dbTrainingProgramCourses.size());
        for (auto &item: _dbTrainingProgramCourses) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourse(std::unique_ptr<DBTrainingProgramCourse> &item) {
        _dbTrainingProgramCourses.emplace_back(std::move(item));
    }

    DBTrainingPairingChart *GetDBTrainingPairingChart(size_t loc) {
        if (_dbTrainingPairingCharts.size() > loc) return _dbTrainingPairingCharts.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingPairingChart *> GetDBTrainingPairingCharts() {
        std::vector<DBTrainingPairingChart *> result;
        result.reserve(_dbTrainingPairingCharts.size());
        for (auto &item: _dbTrainingPairingCharts) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingPairingChart(std::unique_ptr<DBTrainingPairingChart> &item) {
        _dbTrainingPairingChartLocation[item->GetId()] = _dbTrainingPairingCharts.size();
        _dbTrainingPairingCharts.emplace_back(std::move(item));
    }

    DBTrainingProgramCourseDependency *GetDBTrainingProgramCourseDependency(size_t loc) {
        if (_dbTrainingProgramCourseDependencies.size() > loc) return _dbTrainingProgramCourseDependencies.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingProgramCourseDependency *> GetDBTrainingProgramCourseDependencies() {
        std::vector<DBTrainingProgramCourseDependency *> result;
        result.reserve(_dbTrainingProgramCourseDependencies.size());
        for (auto &item: _dbTrainingProgramCourseDependencies) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourseDependency(std::unique_ptr<DBTrainingProgramCourseDependency> &item) {
        _dbTrainingProgramCourseDependencies.emplace_back(std::move(item));
    }

    DBTrainingProgramCourseParticipant *GetDBTrainingProgramCourseParticipant(size_t loc) {
        if (_dbTrainingProgramCourseParticipants.size() > loc) return _dbTrainingProgramCourseParticipants.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingProgramCourseParticipant *> GetDBTrainingProgramCourseParticipants() {
        std::vector<DBTrainingProgramCourseParticipant *> result;
        result.reserve(_dbTrainingProgramCourseParticipants.size());
        for (auto &item: _dbTrainingProgramCourseParticipants) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourseParticipants(std::unique_ptr<DBTrainingProgramCourseParticipant> &item) {
        _dbTrainingProgramCourseParticipants.emplace_back(std::move(item));
    }

    DBTrainingProgramCourseInstructorParticipant *GetDBTrainingProgramCourseInstructorParticipant(size_t loc) {
        if (_dbTrainingProgramCourseInstructorParticipants.size() > loc) return _dbTrainingProgramCourseInstructorParticipants.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingProgramCourseInstructorParticipant *> GetDBTrainingProgramCourseInstructorParticipants() {
        std::vector<DBTrainingProgramCourseInstructorParticipant *> result;
        result.reserve(_dbTrainingProgramCourseInstructorParticipants.size());
        for (auto &item: _dbTrainingProgramCourseInstructorParticipants) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourseInstructorParticipants(std::unique_ptr<DBTrainingProgramCourseInstructorParticipant> &item) {
        _dbTrainingProgramCourseInstructorParticipants.emplace_back(std::move(item));
    }

    DBTrainingPairingChangeRecord *GetDBTrainingPairingChangeRecord(size_t loc) {
        if (_dbTrainingPairingChangeRecords.size() > loc) return _dbTrainingPairingChangeRecords.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingPairingChangeRecord *> GetDBTrainingPairingChangeRecords() {
        std::vector<DBTrainingPairingChangeRecord *> result;
        result.reserve(_dbTrainingPairingChangeRecords.size());
        for (auto &item: _dbTrainingPairingChangeRecords) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingPairingChangeRecords(std::unique_ptr<DBTrainingPairingChangeRecord> &item) {
        _dbTrainingPairingChangeRecords.emplace_back(std::move(item));
    }

    DBTrainingCourseBrief *GetDBTrainingCourseBrief(size_t loc) {
        if (_dbTrainingCourseBriefs.size() > loc) return _dbTrainingCourseBriefs.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingCourseBrief *> GetDBTrainingCourseBriefs() {
        std::vector<DBTrainingCourseBrief *> result;
        result.reserve(_dbTrainingCourseBriefs.size());
        for (auto &item: _dbTrainingCourseBriefs) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseBriefs(std::unique_ptr<DBTrainingCourseBrief> &item) {
        _dbTrainingCourseBriefs.emplace_back(std::move(item));
    }

    DBTrainingCourseDuration *GetDBTrainingCourseDuration(size_t loc) {
        if (_dbTrainingCourseDurations.size() > loc) return _dbTrainingCourseDurations.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingCourseDuration *> GetDBTrainingCourseDurations() {
        std::vector<DBTrainingCourseDuration *> result;
        result.reserve(_dbTrainingCourseDurations.size());
        for (auto &item: _dbTrainingCourseDurations) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingCourseDurations(std::unique_ptr<DBTrainingCourseDuration> &item) {
        _dbTrainingCourseDurations.emplace_back(std::move(item));
    }

    DBTrainingFootprintCourse *GetDBTrainingFootprintCourse(size_t loc) {
        if (_dbTrainingFootprintCourses.size() > loc) return _dbTrainingFootprintCourses.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingFootprintCourse *> GetDBTrainingFootprintCourses() {
        std::vector<DBTrainingFootprintCourse *> result;
        result.reserve(_dbTrainingFootprintCourses.size());
        for (auto &item: _dbTrainingFootprintCourses) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprintCourses(std::unique_ptr<DBTrainingFootprintCourse> &item) {
        _dbTrainingFootprintCourses.emplace_back(std::move(item));
    }

    std::vector<DBTrainingFootprintCourseTrainee *> GetDBTrainingFootprintCourseTrainees() {
        std::vector<DBTrainingFootprintCourseTrainee *> result;
        result.reserve(_dbTrainingFootprintCourseTrainees.size());
        for (auto &item: _dbTrainingFootprintCourseTrainees) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprintCourseTrainees(std::unique_ptr<DBTrainingFootprintCourseTrainee> &item) {
        _dbTrainingFootprintCourseTrainees.emplace_back(std::move(item));
    }

    DBTrainingFootprintCourseSector *GetDBTrainingFootprintCourseSector(size_t loc) {
        if (_dbTrainingFootprintCourseSectors.size() > loc) return _dbTrainingFootprintCourseSectors.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingFootprintCourseSector *> GetDBTrainingFootprintCourseSectors() {
        std::vector<DBTrainingFootprintCourseSector *> result;
        result.reserve(_dbTrainingFootprintCourseSectors.size());
        for (auto &item: _dbTrainingFootprintCourseSectors) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprintCourseSectors(std::unique_ptr<DBTrainingFootprintCourseSector> &item) {
        _dbTrainingFootprintCourseSectors.emplace_back(std::move(item));
        _dbTrainingFootprintCourseSectorLocation[_dbTrainingFootprintCourseSectors.back()->GetId()] = _dbTrainingFootprintCourseSectors.size() - 1;
    }

    DBTrainingFootprint *GetDBTrainingFootprint(size_t loc) {
        if (_dbTrainingFootprints.size() > loc) return _dbTrainingFootprints.at(loc).get();
        return nullptr;
    }
    std::vector<DBTrainingFootprint *> GetDBTrainingFootprints() {
        std::vector<DBTrainingFootprint *> result;
        result.reserve(_dbTrainingFootprints.size());
        for (auto &item: _dbTrainingFootprints) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprints(std::unique_ptr<DBTrainingFootprint> &item) {
        _dbTrainingFootprints.emplace_back(std::move(item));
    }

    DBTrainingProgramCourseIpRole *GetDBTrainingProgramCourseIpRole(size_t loc) {
        if (_dbTrainingProgramCourseIpRoles.size() > loc) return _dbTrainingProgramCourseIpRoles.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingProgramCourseIpRole *> GetDBTrainingProgramCourseIpRoles() {
        std::vector<DBTrainingProgramCourseIpRole *> result;
        result.reserve(_dbTrainingProgramCourseIpRoles.size());
        for (auto &item: _dbTrainingProgramCourseIpRoles) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourseIpRole(std::unique_ptr<DBTrainingProgramCourseIpRole> &item) {
        _dbTrainingProgramCourseIpRoleLocation[item->GetId()] = _dbTrainingProgramCourseIpRoles.size();
        _dbTrainingProgramCourseIpRoles.emplace_back(std::move(item));
    }

    DBTrainingProgramCourseRole *GetDBTrainingProgramCourseRole(size_t loc) {
        if (_dbTrainingProgramCourseRoles.size() > loc) return _dbTrainingProgramCourseRoles.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingProgramCourseRole *> GetDBTrainingProgramCourseRoles() {
        std::vector<DBTrainingProgramCourseRole *> result;
        result.reserve(_dbTrainingProgramCourseRoles.size());
        for (auto &item: _dbTrainingProgramCourseRoles) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingProgramCourseRole(std::unique_ptr<DBTrainingProgramCourseRole> &item) {
        _dbTrainingProgramCourseRoleLocation[item->GetId()] = _dbTrainingProgramCourseRoles.size();
        _dbTrainingProgramCourseRoles.emplace_back(std::move(item));
    }

    DBTrainingFootprintCourseIpRole *GetDBTrainingFootprintCourseIpRole(size_t loc) {
        if (_dbTrainingFootprintCourseIpRoles.size() > loc) return _dbTrainingFootprintCourseIpRoles.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingFootprintCourseIpRole *> GetDBTrainingFootprintCourseIpRoles() {
        std::vector<DBTrainingFootprintCourseIpRole *> result;
        result.reserve(_dbTrainingFootprintCourseIpRoles.size());
        for (auto &item: _dbTrainingFootprintCourseIpRoles) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprintCourseIpRole(std::unique_ptr<DBTrainingFootprintCourseIpRole> &item) {
        _dbTrainingFootprintCourseIpRoleLocation[item->GetId()] = _dbTrainingFootprintCourseIpRoles.size();
        _dbTrainingFootprintCourseIpRoles.emplace_back(std::move(item));
    }

    DBTrainingFootprintCourseRole *GetDBTrainingFootprintCourseRole(size_t loc) {
        if (_dbTrainingFootprintCourseRoles.size() > loc) return _dbTrainingFootprintCourseRoles.at(loc).get();
        return nullptr;
    }

    std::vector<DBTrainingFootprintCourseRole *> GetDBTrainingFootprintCourseRoles() {
        std::vector<DBTrainingFootprintCourseRole *> result;
        result.reserve(_dbTrainingFootprintCourseRoles.size());
        for (auto &item: _dbTrainingFootprintCourseRoles) {
            result.emplace_back(item.get());
        }
        return std::move(result);
    }

    void PushDBTrainingFootprintCourseRole(std::unique_ptr<DBTrainingFootprintCourseRole> &item) {
        _dbTrainingFootprintCourseRoleLocation[item->GetId()] = _dbTrainingFootprintCourseRoles.size();
        _dbTrainingFootprintCourseRoles.emplace_back(std::move(item));
    }

private:
    std::vector<std::unique_ptr<DBTrainingCourse>> _dbTrainingCourses;
    std::unordered_map<long long, size_t> _dbTrainingCourseLocation;
    std::vector<std::unique_ptr<DBTrainingCourseDeviceRequirement>> _dbTrainingCourseDeviceRequirements;
    std::unordered_map<long long, size_t> _dbTrainingCourseDeviceRequirementLocation;
    std::vector<std::unique_ptr<DBTrainingCourseDeviceRequirementAttendant>> _dbTrainingCourseDeviceRequirementAttendants;
    std::unordered_map<long long, size_t> _dbTrainingCourseDeviceRequirementAttendantLocation;
    std::vector<std::unique_ptr<DBTrainingCourseDeviceRequirementSlot>> _dbTrainingCourseDeviceRequirementSlots;
    std::unordered_map<long long, size_t> _dbTrainingCourseDeviceRequirementSlotLocation;
    std::vector<std::unique_ptr<DBTrainingCourseGrantQualification>> _dbTrainingCourseGrantQualifications;
    std::unordered_map<long long, size_t> _dbTrainingCourseGrantQualificationLocation;
    std::vector<std::unique_ptr<DBTrainingCoursePairingRequirement>> _dbTrainingCoursePairingRequirements;
    std::unordered_map<long long, size_t> _dbTrainingCoursePairingRequirementLocation;
    std::vector<std::unique_ptr<DBTrainingCourseRoleRequirement>> _dbTrainingCourseRoleRequirements;
    std::unordered_map<long long, size_t> _dbTrainingCourseRoleRequirementLocation;
    std::vector<std::unique_ptr<DBTrainingCourseRole>> _dbTrainingCourseRoles;
    std::vector<std::unique_ptr<DBTrainingDevice>> _dbTrainingDevices;
    std::unordered_map<long long, size_t> _dbTrainingDeviceLocation;
    std::vector<std::unique_ptr<DBTrainingDeviceOccupiedTime>> _dbTrainingDeviceOccupiedTimes;
    std::unordered_map<long long, size_t> _dbTrainingDeviceOccupiedTimeLocation;
    std::vector<std::unique_ptr<DBTrainingPairingSeparationComplement>> _dbTrainingPairingSeparationComplements;
    std::unordered_map<long long, size_t> _dbTrainingPairingSeparationComplementLocation;
    std::vector<std::unique_ptr<DBTrainingPairingSeparationRequirement>> _dbTrainingPairingSeparationRequirements;
    std::unordered_map<long long, size_t> _dbTrainingPairingSeparationRequirementLocation;
    std::vector<std::unique_ptr<DBTrainingPairingSeparationRoster>> _dbTrainingPairingSeparationRosters;
    std::unordered_map<long long, size_t> _dbTrainingPairingSeparationRosterLocation;
    std::vector<std::unique_ptr<DBTrainingProgram>> _dbTrainingPrograms;
    std::unordered_map<long long, size_t> _dbTrainingProgramLocation;
    std::vector<std::unique_ptr<DBTrainingProgramCourse>> _dbTrainingProgramCourses;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseLocation;
    std::vector<std::unique_ptr<DBTrainingPairingChart>> _dbTrainingPairingCharts;
    std::unordered_map<long long, size_t> _dbTrainingPairingChartLocation;
    std::vector<std::unique_ptr<DBTrainingProgramCourseDependency>> _dbTrainingProgramCourseDependencies;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseDependencyLocation;
    std::vector<std::unique_ptr<DBTrainingProgramCourseParticipant>> _dbTrainingProgramCourseParticipants;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseParticipantLocation;
    std::vector<std::unique_ptr<DBTrainingProgramCourseInstructorParticipant>> _dbTrainingProgramCourseInstructorParticipants;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseInstructorParticipantLocation;
    std::vector<std::unique_ptr<DBTrainingPairingChangeRecord>> _dbTrainingPairingChangeRecords;
    std::unordered_map<long long, size_t> _dbTrainingPairingChangeRecordLocation;
    std::vector<std::unique_ptr<DBTrainingCourseBrief>> _dbTrainingCourseBriefs;
    std::unordered_map<long long, size_t> _dbTrainingCourseBriefLocation;
    std::vector<std::unique_ptr<DBTrainingCourseDuration>> _dbTrainingCourseDurations;
    std::unordered_map<long long, size_t> _dbTrainingCourseDurationLocation;
    std::vector<std::unique_ptr<DBTrainingFootprintCourse>> _dbTrainingFootprintCourses;
    std::unordered_map<long long, size_t> _dbTrainingFootprintCourseLocation;
    std::vector<std::unique_ptr<DBTrainingFootprintCourseTrainee>> _dbTrainingFootprintCourseTrainees;
    std::vector<std::unique_ptr<DBTrainingFootprintCourseSector>> _dbTrainingFootprintCourseSectors;
    std::unordered_map<long long, size_t> _dbTrainingFootprintCourseSectorLocation;
    std::vector<std::unique_ptr<DBTrainingFootprint>> _dbTrainingFootprints;

    std::vector<std::unique_ptr<DBTrainingProgramCourseIpRole>> _dbTrainingProgramCourseIpRoles;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseIpRoleLocation;

    std::vector<std::unique_ptr<DBTrainingProgramCourseRole>> _dbTrainingProgramCourseRoles;
    std::unordered_map<long long, size_t> _dbTrainingProgramCourseRoleLocation;

    std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRole>> _dbTrainingFootprintCourseIpRoles;
    std::unordered_map<long long, size_t> _dbTrainingFootprintCourseIpRoleLocation;

    std::vector<std::unique_ptr<DBTrainingFootprintCourseRole>> _dbTrainingFootprintCourseRoles;
    std::unordered_map<long long, size_t> _dbTrainingFootprintCourseRoleLocation;
};


#endif //TRAININGOPTIMIZER_DBTRAININGDATAHOLDER_H
